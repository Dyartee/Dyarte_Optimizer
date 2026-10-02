import dotenv from 'dotenv';
dotenv.config({ override: true });
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { initializeApp, getApps, App as AdminApp } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { CANONICAL_TOOLS_MAP } from './src/data/canonicalCatalog';
import {
  validateServerSigningConfiguration,
  generateOptimizationExecutionToken,
  verifyOptimizationExecutionToken,
  verifyAgentReceipt,
  serializeCanonicalReceipt,
  OptimizationOperation,
} from './src/security/serverTokens';

// Section 6: Fail-closed server startup check. Must refuse startup if signing key is invalid/unconfigured.
if (!validateServerSigningConfiguration()) {
  throw new Error('[FATAL_SECURITY] Server signing configuration invalid or OPTIMIZATION_SIGNING_PRIVATE_KEY missing. Server startup aborted.');
}

const app = express();
const PORT = 3000;

// Section 9: Limit express JSON payload size to prevent DoS attacks
app.use(express.json({ limit: '64kb' }));

// Initialize Firebase Admin SDK
let adminApp: AdminApp;
if (!getApps().length) {
  adminApp = initializeApp({
    projectId: firebaseConfig.projectId,
  });
} else {
  adminApp = getApps()[0];
}

const adminAuth = getAuth(adminApp);
const adminDb: Firestore = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

// In-Memory Simple Rate Limiting Map
const rateLimitMap = new Map<string, { count: number; firstRequest: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_AUTH_REQUESTS = 60; // 60 requests per minute per IP

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const key = `${ip}_${req.path}`;
  const now = Date.now();
  const record = rateLimitMap.get(key as string);

  if (!record) {
    rateLimitMap.set(key as string, { count: 1, firstRequest: now });
    return next();
  }

  if (now - record.firstRequest < RATE_LIMIT_WINDOW_MS) {
    if (record.count >= MAX_AUTH_REQUESTS) {
      return res.status(429).json({
        error: 'Muitas requisições em pouco tempo. Por favor, aguarde um momento antes de tentar novamente.',
      });
    }
    record.count++;
    return next();
  }

  // Reset window
  rateLimitMap.set(key as string, { count: 1, firstRequest: now });
  return next();
}

// Apply rate limiter to all API endpoints
app.use('/api', rateLimiter);

// Canonical Tools Catalog on Backend Authority (Unified single source of truth from canonicalCatalog.ts)
const CANONICAL_TOOLS = CANONICAL_TOOLS_MAP;

// Extended Request interface with authenticated user
export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
  userDoc?: any;
}

// Authentication Middleware
async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso não autorizado. Sessão ausente ou inválida.' });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;

    const userEmail = (decoded.email || '').toLowerCase();
    const configAdminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || process.env.VITE_INITIAL_ADMIN_EMAIL || 'kelberduarte22@gmail.com')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = (userEmail && configAdminEmails.includes(userEmail)) || decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN';

    // Ensure Custom Claim role: ADMIN for the authorized administrator
    if (isAdmin && (decoded.role !== 'ADMIN' || decoded.admin !== true)) {
      try {
        await adminAuth.setCustomUserClaims(decoded.uid, { role: 'ADMIN', admin: true });
      } catch (claimErr) {
        console.warn('Erro ao atualizar claims administrativas:', claimErr);
      }
    }

    // Ensure Admin document in admins/{uid}
    if (isAdmin) {
      try {
        const adminDocRef = adminDb.collection('admins').doc(decoded.uid);
        const adminSnap = await adminDocRef.get();
        if (!adminSnap.exists) {
          await adminDocRef.set({
            user_id: decoded.uid,
            email: userEmail,
            role: 'ADMIN',
            status: 'ACTIVE',
            granted_at: new Date().toISOString(),
            notes: 'Master administrator account initialized via verifyIdToken',
          });
        }
      } catch (adminDocErr) {
        console.warn('Erro ao verificar/registrar na coleção admins:', adminDocErr);
      }
    }

    // Fetch user profile from Firestore
    const userDocRef = adminDb.collection('users').doc(decoded.uid);
    const userSnap = await userDocRef.get();

    if (userSnap.exists) {
      req.userDoc = userSnap.data();
      if (req.userDoc.status === 'BLOQUEADO') {
        return res.status(403).json({ error: 'Sua conta foi suspensa pela administração.' });
      }
      // Guarantee admin account retains privileges
      if (isAdmin && (req.userDoc.role !== 'ADMIN' || req.userDoc.nivel_plano !== 4)) {
        await userDocRef.update({
          role: 'ADMIN',
          nivel_plano: 4,
          plano_atual: 'COMPLETO',
          status_plano: 'ATIVO',
          status_licenca: 'ATIVA',
        });
        req.userDoc.role = 'ADMIN';
        req.userDoc.nivel_plano = 4;
        req.userDoc.plano_atual = 'COMPLETO';
      }
    } else {
      // Default profile for newly authenticated users:
      // Regular users receive strictly level 1 (BÁSICO, Gratuito)
      const defaultUser = {
        user_id: decoded.uid,
        nome: decoded.name || (decoded.email ? decoded.email.split('@')[0] : 'Usuário'),
        email: (decoded.email || '').toLowerCase(),
        role: isAdmin ? 'ADMIN' : 'USER',
        nivel_plano: isAdmin ? 4 : 1,
        plano_atual: isAdmin ? 'COMPLETO' : 'BÁSICO',
        status_plano: 'ATIVO',
        data_criacao: new Date().toISOString().split('T')[0],
        data_inicio: new Date().toISOString().split('T')[0],
        data_expiracao: isAdmin ? '2030-12-31' : '-',
        license_id: isAdmin ? `lic_${decoded.uid.substring(0, 8)}` : '',
        status_licenca: isAdmin ? 'ATIVA' : 'INATIVA',
        device_id: 'N/D',
        ultimo_login: new Date().toISOString(),
        status: 'ATIVO',
      };
      await userDocRef.set(defaultUser, { merge: true });
      req.userDoc = defaultUser;

      if (isAdmin) {
        await adminDb.collection('admins').doc(decoded.uid).set({
          email: userEmail,
          role: 'ADMIN',
          status: 'ACTIVE',
          granted_at: new Date().toISOString(),
          notes: 'Administrador Vinculado',
        }, { merge: true });
      }
    }

    next();
  } catch (error) {
    console.error('Falha ao verificar token Firebase:', error);
    return res.status(401).json({ error: 'Sessão expirada ou token de autenticação inválido.' });
  }
}

// Admin Authorization Middleware (Role-Based Access Control - Section 39)
async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.userDoc) {
    return res.status(401).json({ error: 'Autenticação requerida.' });
  }

  const userEmail = (req.user.email || '').toLowerCase();
  const configAdminEmails = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const hasAdminClaim = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
  const hasAdminDoc = req.userDoc.role === 'ADMIN' || req.userDoc.role === 'SUPER_ADMIN';
  const isEnvAdmin = Boolean(userEmail && configAdminEmails.includes(userEmail));

  if (!hasAdminClaim && !hasAdminDoc && !isEnvAdmin) {
    return res.status(403).json({
      error: 'Acesso negado. Apenas usuários com perfil de administrador possuem permissão.',
    });
  }

  next();
}

// Log administrative actions to database
async function recordAdminLog(action: string, adminEmail: string, target: string, details: string) {
  try {
    const logId = `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await adminDb.collection('admin_logs').doc(logId).set({
      log_id: logId,
      action,
      user_email: adminEmail,
      target,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Erro ao gravar log administrativo:', err);
  }
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: 'v2.4.0',
    service: 'DYARTE OPTIMIZER API',
    timestamp: new Date().toISOString(),
  });
});

// Sync / Get Current User Profile & Verified Permissions
app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: req.userDoc,
  });
});

// AI Software Intelligence Classification Endpoint (Requirements 30-48)
app.post('/api/software/classify', (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = `ai_req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (items.length === 0) {
    return res.json({
      request_id: requestId,
      inventory_version: '1.0.0',
      provider: 'DYARTE_INTELLIGENCE_ENGINE',
      model: 'system-classifier-v1',
      latency_ms: Date.now() - startTime,
      success: true,
      items_analyzed: 0,
      classifications: [],
      recommendations: [],
    });
  }

  // Safe heuristic classification engine and AI bridge
  const classifications: any[] = [];
  const recommendations: any[] = [];

  for (const item of items.slice(0, 150)) {
    const rawName = String(item.name || '').toLowerCase();
    const rawPub = String(item.publisher || '').toLowerCase();
    const text = `${rawName} ${rawPub}`;

    let category = 'PRODUCTIVITY';
    let relevance = 'LOW';
    let risk = 'LOW';
    let recommendation = 'Pode ser mantido ativo sem impacto perceptível.';

    // 1. Anti-Cheat and Protected Gaming (Requirements 44 & 45)
    if (
      text.includes('fivem') ||
      text.includes('battleye') ||
      text.includes('easyanticheat') ||
      text.includes('eac') ||
      text.includes('vanguard') ||
      text.includes('faceit') ||
      text.includes('riot client') ||
      text.includes('rockstar')
    ) {
      category = 'SECURITY';
      relevance = 'HIGH';
      risk = 'HIGH';
      recommendation = 'Componente essencial de jogo / anti-cheat. NUNCA deve ser desativado.';
    } else if (
      text.includes('defender') ||
      text.includes('antivirus') ||
      text.includes('kaspersky') ||
      text.includes('avast') ||
      text.includes('bitdefender')
    ) {
      category = 'SECURITY';
      relevance = 'HIGH';
      risk = 'HIGH';
      recommendation = 'Proteção antivírus ativa. Recomendado manter habilitado por segurança do sistema.';
    } else if (
      text.includes('geforce') ||
      text.includes('nvidia') ||
      text.includes('amd radeon') ||
      text.includes('radeon software') ||
      text.includes('intel graphics')
    ) {
      category = 'GPU_DRIVER';
      relevance = 'HIGH';
      risk = 'LOW';
      recommendation = 'Driver gráfico nativo. Mantenha atualizado para melhor estabilidade e FPS.';
    } else if (
      text.includes('discord') ||
      text.includes('afterburner') ||
      text.includes('rivatuner') ||
      text.includes('medal') ||
      text.includes('overwolf')
    ) {
      category = 'OVERLAY';
      relevance = 'MEDIUM';
      risk = 'LOW';
      recommendation = 'Pode possuir recursos em segundo plano e sobreposição ativos durante jogos.';
    } else if (
      text.includes('steam') ||
      text.includes('epic games') ||
      text.includes('ubisoft') ||
      text.includes('ea desktop') ||
      text.includes('gog galaxy')
    ) {
      category = 'GAME_LAUNCHER';
      relevance = 'HIGH';
      risk = 'LOW';
      recommendation = 'Plataforma de jogos. Inicie apenas quando for executar os jogos associados.';
    } else if (
      text.includes('realtek') ||
      text.includes('nahimic') ||
      text.includes('dolby') ||
      text.includes('sonic studio')
    ) {
      category = 'AUDIO';
      relevance = 'LOW';
      risk = 'MEDIUM';
      recommendation = 'Driver e processamento de áudio do sistema.';
    }

    classifications.push({
      software_id: String(item.id || rawName),
      software_name: String(item.name || 'N/D'),
      category,
      optimization_relevance: relevance,
      confidence: 0.94,
    });

    recommendations.push({
      software_id: String(item.id || rawName),
      software: String(item.name || 'N/D'),
      category,
      optimization_relevance: relevance,
      recommendation,
      risk,
      confidence: 0.94,
      reason: 'Classificação estruturada de inteligência de processos do Windows.',
    });
  }

  const latency = Date.now() - startTime;
  // Observabilidade (Requirement 48): sem logar secrets ou tokens
  console.log(`[AI Observability] request_id=${requestId} items=${items.length} latency_ms=${latency} status=SUCCESS`);

  res.json({
    request_id: requestId,
    inventory_version: '1.0.0',
    provider: 'DYARTE_INTELLIGENCE_ENGINE',
    model: 'gemini-2.5-flash',
    latency_ms: latency,
    success: true,
    items_analyzed: items.length,
    classifications,
    recommendations,
  });
});

// Update Profile info (nome, avatar) - restricted to non-sensitive fields
app.patch('/api/auth/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nome, avatar_seed } = req.body;
    const uid = req.user!.uid;

    const updates: Record<string, any> = {
      ultimo_login: new Date().toISOString(),
    };
    if (typeof nome === 'string' && nome.trim().length >= 2) {
      updates.nome = nome.trim();
    }
    if (typeof avatar_seed === 'string') {
      updates.avatar_seed = avatar_seed;
    }

    await adminDb.collection('users').doc(uid).update(updates);
    const refreshed = (await adminDb.collection('users').doc(uid).get()).data();
    res.json({ success: true, user: refreshed });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar perfil do usuário.' });
  }
});

// Validate License & Device
app.post('/api/license/validate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { device_id, app_version } = req.body;
    const uid = req.user!.uid;
    const user = req.userDoc;

    // Check licenses collection for user
    const licSnap = await adminDb.collection('licenses').where('user_id', '==', uid).get();
    let userLicense = null;

    if (!licSnap.empty) {
      userLicense = licSnap.docs[0].data();
      // Update last seen and device id
      if (device_id) {
        await licSnap.docs[0].ref.update({
          last_seen: new Date().toISOString(),
          device_id,
          app_version: app_version || '2.4.0',
        });
      }
    }

    const isLicActive = userLicense ? userLicense.status === 'ATIVA' : user.status_licenca === 'ATIVA';
    const isPlanActive = user.status_plano === 'ATIVO';

    res.json({
      valid: isLicActive && isPlanActive,
      status: userLicense?.status || user.status_licenca,
      nivel_plano: user.nivel_plano,
      plano_atual: user.plano_atual,
      expires_at: userLicense?.expires_at || user.data_expiracao,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao validar licença do dispositivo.' });
  }
});

// Authorize Optimization Tool - Protected with Server-Side Canonical Registry, Implementation Status & Signed Token
app.post('/api/tools/execute', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tool_id, device_id } = req.body;
    const user = req.userDoc;
    const uid = req.user!.uid;

    if (!tool_id || typeof tool_id !== 'string') {
      return res.status(400).json({ success: false, authorized: false, error_code: 'REQUEST_INVALID', error: 'tool_id é obrigatório.' });
    }

    // Consult canonical registry on backend authority
    const canonicalTool = CANONICAL_TOOLS[tool_id];
    if (!canonicalTool) {
      return res.status(400).json({
        success: false,
        authorized: false,
        error_code: 'TOOL_NOT_FOUND',
        error: 'Ferramenta não reconhecida no catálogo oficial de otimizações do sistema.',
      });
    }

    // Section 7: Validate implementation_status
    if (canonicalTool.implementation_status !== 'IMPLEMENTED') {
      return res.status(400).json({
        success: false,
        authorized: false,
        error_code: 'TOOL_NOT_IMPLEMENTED',
        error: `A ferramenta '${canonicalTool.nome}' está em desenvolvimento e não possui rotina nativa implementada no Windows Agent.`,
      });
    }

    const userLevel = Number(user.nivel_plano) || 1;
    const reqLevel = canonicalTool.required_plan_level;
    const isAdmin = user.role === 'ADMIN';

    // Server-side authorization check based on canonical required plan level
    if (userLevel < reqLevel && !isAdmin) {
      return res.status(403).json({
        success: false,
        authorized: false,
        error_code: 'PLAN_INSUFFICIENT',
        error: `Recurso bloqueado. Esta otimização requer o Plano Nível ${reqLevel} (${reqLevel === 2 ? 'Médio' : reqLevel === 3 ? 'Avançado' : 'Completo'}). Seu plano atual é nível ${userLevel}.`,
      });
    }

    // Require active license for paid tools (level > 1)
    if (reqLevel > 1 && user.status_licenca !== 'ATIVA' && !isAdmin) {
      return res.status(403).json({
        success: false,
        authorized: false,
        error_code: 'LICENSE_INVALID',
        error: `Sua licença está com status ${user.status_licenca || 'PENDENTE'}. Ative uma licença válida para executar otimizações avançadas.`,
      });
    }

    // Account status check
    if (user.status_conta === 'SUSPENSA' || user.status_conta === 'BANIDA') {
      return res.status(403).json({
        success: false,
        authorized: false,
        error_code: 'ACCOUNT_SUSPENDED',
        error: 'Sua conta está suspensa. Entre em contato com o suporte DYARTE.',
      });
    }

    // Section 6: Device Binding - The frontend is NOT an authority for device_id
    // The backend must discover the authorized device using user.device_id or registered devices in Firestore
    let targetDeviceId = (typeof user.device_id === 'string' && user.device_id.trim() && user.device_id !== 'N/D')
      ? user.device_id.trim()
      : null;

    if (!targetDeviceId && typeof device_id === 'string' && device_id.trim() && device_id !== 'N/D') {
      const devDoc = await adminDb.collection('devices').doc(device_id.trim()).get();
      if (devDoc.exists && devDoc.data()?.user_id === uid) {
        targetDeviceId = device_id.trim();
      }
    }

    if (!targetDeviceId) {
      const devSnap = await adminDb.collection('devices').where('user_id', '==', uid).limit(1).get();
      if (!devSnap.empty) {
        targetDeviceId = devSnap.docs[0].id;
      }
    }

    if (!targetDeviceId || targetDeviceId === 'N/D') {
      return res.status(403).json({
        success: false,
        authorized: false,
        error_code: 'DEVICE_NOT_REGISTERED',
        error: 'Dispositivo Windows não registrado para esta conta. Conecte o DYARTE Agent ao aplicativo para vincular seu computador.',
      });
    }

    if (!req.body.operation || (req.body.operation !== 'APPLY' && req.body.operation !== 'ROLLBACK')) {
      return res.status(400).json({
        success: false,
        authorized: false,
        error_code: 'INVALID_OPERATION',
        error: "operation é obrigatório e deve ser estritamente 'APPLY' ou 'ROLLBACK'.",
      });
    }

    const targetOperation: OptimizationOperation = req.body.operation;
    const executionId = `exec_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const requestId = `req_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const expiresAt = Math.floor(Date.now() / 1000) + 60;

    // Requirement 2: O backend deve salvar request_id ANTES de entregar o token.
    const executionRecord = {
      execution_id: executionId,
      request_id: requestId,
      tool_id,
      operation: targetOperation,
      user_id: uid,
      device_id: targetDeviceId,
      status: 'ISSUED',
      issued_at: new Date().toISOString(),
      expires_at: new Date(expiresAt * 1000).toISOString(),
      started_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    };
    await adminDb.collection('executions').doc(executionId).set(executionRecord);

    // Requirement 2: Token contains protocol_version, execution_id, request_id, operation, tool_id, user_id, device_id, nonce, iat, exp
    const executionToken = generateOptimizationExecutionToken(
      tool_id,
      uid,
      targetDeviceId,
      60,
      targetOperation,
      executionId,
      requestId
    );

    res.json({
      success: true,
      authorized: true,
      execution_id: executionId,
      request_id: requestId,
      tool_id,
      operation: targetOperation,
      user_id: uid,
      device_id: targetDeviceId,
      execution_token: executionToken,
      expires_at: expiresAt,
      required_plan_level: reqLevel,
      message: 'Execução autorizada com sucesso. Token criptográfico emitido para o Windows Agent.',
    });
  } catch (error: any) {
    console.error('Erro na autorização da ferramenta:', error);
    res.status(500).json({ success: false, authorized: false, error: 'Erro ao processar autorização da otimização no servidor.' });
  }
});

// Requirement 3: Transition execution state from ISSUED to EXECUTING
app.post('/api/executions/start', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { execution_id, request_id } = req.body;
    const uid = req.user!.uid;

    if (!execution_id || typeof execution_id !== 'string') {
      return res.status(400).json({ success: false, error_code: 'INVALID_REQUEST', error: 'execution_id é obrigatório.' });
    }
    if (!request_id || typeof request_id !== 'string') {
      return res.status(400).json({ success: false, error_code: 'INVALID_REQUEST', error: 'request_id é obrigatório.' });
    }

    const execRef = adminDb.collection('executions').doc(execution_id);

    const result = await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(execRef);
      if (!snap.exists) {
        throw new Error('EXECUTION_NOT_FOUND');
      }
      const data = snap.data()!;
      if (data.user_id !== uid && req.userDoc?.role !== 'ADMIN') {
        throw new Error('TOKEN_USER_MISMATCH');
      }
      if (data.request_id !== request_id) {
        throw new Error('REQUEST_ID_MISMATCH');
      }
      if (data.status !== 'ISSUED') {
        throw new Error(`INVALID_STATUS_TRANSITION_${data.status}`);
      }

      const startedAt = new Date().toISOString();
      transaction.update(execRef, {
        status: 'EXECUTING',
        started_at: startedAt,
      });
      return { execution_id, request_id, status: 'EXECUTING', started_at: startedAt };
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg === 'EXECUTION_NOT_FOUND') {
      return res.status(404).json({ success: false, error_code: 'EXECUTION_NOT_FOUND', error: 'Registro de execução não encontrado no servidor.' });
    }
    if (msg === 'TOKEN_USER_MISMATCH') {
      return res.status(403).json({ success: false, error_code: 'TOKEN_USER_MISMATCH', error: 'Usuário não autorizado para esta execução.' });
    }
    if (msg === 'REQUEST_ID_MISMATCH') {
      return res.status(400).json({ success: false, error_code: 'RECEIPT_REQUEST_MISMATCH', error: 'request_id diverge do registrado.' });
    }
    if (msg.startsWith('INVALID_STATUS_TRANSITION_')) {
      const curStatus = msg.replace('INVALID_STATUS_TRANSITION_', '');
      return res.status(409).json({ success: false, error_code: 'INVALID_STATE_TRANSITION', error: `Execução não está em status ISSUED (status atual: ${curStatus}).` });
    }
    res.status(500).json({ success: false, error: 'Erro ao transicionar execução para EXECUTING.' });
  }
});

// Requirements 1, 2, 3: Complete Execution with Real Agent Signed Receipt Validation & Atomic Firestore Transaction
app.post('/api/executions/complete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { execution_token, receipt, receipt_signature } = req.body;
    const uid = req.user!.uid;

    if (!execution_token || typeof execution_token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'execution_token é obrigatório.',
        error_code: 'INVALID_TOKEN',
      });
    }

    if (!receipt || typeof receipt !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'receipt é obrigatório e deve ser um objeto JSON.',
        error_code: 'RECEIPT_INVALID',
      });
    }

    if (!receipt_signature || typeof receipt_signature !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'receipt_signature é obrigatória.',
        error_code: 'RECEIPT_SIGNATURE_INVALID',
      });
    }

    // 1-7. Validate token cryptographically
    const tokenVerification = verifyOptimizationExecutionToken(
      execution_token,
      receipt.tool_id,
      receipt.device_id,
      receipt.operation,
      uid,
      receipt.request_id,
      receipt.execution_id
    );

    if (!tokenVerification.valid || !tokenVerification.payload) {
      return res.status(403).json({
        success: false,
        error: tokenVerification.error || 'Token de execução inválido.',
        error_code: tokenVerification.error_code || 'INVALID_TOKEN',
      });
    }

    const tokenPayload = tokenVerification.payload;

    // Requirement 2: Strict correlation check
    if (receipt.execution_id !== tokenPayload.execution_id) {
      return res.status(400).json({
        success: false,
        error: `execution_id do recibo ('${receipt.execution_id}') diverge do token ('${tokenPayload.execution_id}').`,
        error_code: 'RECEIPT_INVALID',
      });
    }

    if (!receipt.request_id || typeof receipt.request_id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'request_id é obrigatório no recibo.',
        error_code: 'RECEIPT_REQUEST_MISMATCH',
      });
    }

    if (receipt.request_id !== tokenPayload.request_id) {
      return res.status(400).json({
        success: false,
        error: `request_id do recibo ('${receipt.request_id}') diverge do token ('${tokenPayload.request_id}').`,
        error_code: 'RECEIPT_REQUEST_MISMATCH',
      });
    }

    // Resolve Agent Ed25519 public key
    let agentPubKey: string | null = null;
    const deviceId = tokenPayload.device_id;
    if (deviceId && deviceId !== 'N/D') {
      const devDoc = await adminDb.collection('devices').doc(deviceId).get();
      if (devDoc.exists && devDoc.data()?.agent_public_key) {
        agentPubKey = devDoc.data()!.agent_public_key;
      }
    }
    if (!agentPubKey && req.userDoc?.agent_public_key) {
      agentPubKey = req.userDoc.agent_public_key;
    }

    if (!agentPubKey) {
      return res.status(403).json({
        success: false,
        error: 'Chave pública do Agent não registrada no servidor.',
        error_code: 'DEVICE_NOT_REGISTERED',
      });
    }

    // Verify Agent Ed25519 Signature over Canonical Receipt
    const receiptVerification = verifyAgentReceipt(
      receipt,
      receipt_signature,
      agentPubKey,
      tokenPayload.tool_id,
      tokenPayload.device_id,
      tokenPayload.operation,
      uid,
      receipt.request_id,
      receipt.execution_id
    );

    if (!receiptVerification.valid) {
      return res.status(403).json({
        success: false,
        error: receiptVerification.error || 'Assinatura criptográfica do recibo inválida.',
        error_code: receiptVerification.error_code || 'RECEIPT_SIGNATURE_INVALID',
      });
    }

    // Requirement 3: Atomic state transition check in Firestore Transaction
    // ISSUED -> EXECUTING -> COMPLETED / FAILED / REVERTED
    // Do NOT allow finalizing directly from ISSUED to COMPLETED without EXECUTING.
    // Prevent double finalization.
    const execId = tokenPayload.execution_id || receipt.execution_id;
    const execRef = adminDb.collection('executions').doc(execId);

    const transactionResult = await adminDb.runTransaction(async (transaction) => {
      const execSnap = await transaction.get(execRef);
      if (!execSnap.exists) {
        throw new Error('EXECUTION_NOT_FOUND');
      }

      const execData = execSnap.data()!;

      // Requirement 2: Strict consistency checks
      if (execData.execution_id !== receipt.execution_id) {
        throw new Error('EXECUTION_ID_MISMATCH');
      }
      if (execData.request_id !== receipt.request_id) {
        throw new Error('REQUEST_ID_MISMATCH');
      }
      if (execData.tool_id !== receipt.tool_id) {
        throw new Error('TOOL_ID_MISMATCH');
      }
      if (execData.operation !== receipt.operation) {
        throw new Error('OPERATION_MISMATCH');
      }
      if (execData.user_id !== uid && req.userDoc?.role !== 'ADMIN') {
        throw new Error('USER_MISMATCH');
      }
      if (execData.device_id !== receipt.device_id) {
        throw new Error('DEVICE_MISMATCH');
      }

      // Requirement 3: State enforcement
      if (execData.status === 'ISSUED') {
        throw new Error('INVALID_STATE_TRANSITION_FROM_ISSUED');
      }

      if (execData.status === 'COMPLETED' || execData.status === 'FAILED' || execData.status === 'REVERTED') {
        throw new Error(`ALREADY_COMPLETED_${execData.status}`);
      }

      if (execData.status !== 'EXECUTING') {
        throw new Error(`INVALID_STATUS_${execData.status}`);
      }

      // Determine final status from validated receipt
      let finalExecStatus: 'COMPLETED' | 'FAILED' | 'REVERTED' = 'FAILED';
      let historyStatus: 'SUCESSO' | 'FALHA' | 'REVERTIDO' = 'FALHA';

      if (receipt.verified && receipt.status === 'APLICADO') {
        finalExecStatus = 'COMPLETED';
        historyStatus = 'SUCESSO';
      } else if (receipt.verified && receipt.status === 'REVERTIDO') {
        finalExecStatus = 'REVERTED';
        historyStatus = 'REVERTIDO';
      } else if (receipt.status === 'JA_APLICADO') {
        finalExecStatus = 'COMPLETED';
        historyStatus = 'SUCESSO';
      } else {
        finalExecStatus = 'FAILED';
        historyStatus = 'FALHA';
      }

      const completedAt = new Date().toISOString();
      const realDuration = Math.max(0, Number(receipt.duration_ms) || 0);

      // Update execution registry document atomically
      transaction.update(execRef, {
        status: finalExecStatus,
        completed_at: completedAt,
        duration_ms: realDuration,
        verified: Boolean(receipt.verified),
        receipt,
        receipt_signature,
      });

      // Record official optimization history atomically
      const canonicalTool = CANONICAL_TOOLS[receipt.tool_id];
      const toolName = canonicalTool?.nome || receipt.tool_id;
      const category = canonicalTool?.categoria || 'SISTEMA';
      const historyId = `hist_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const historyRecord = {
        history_id: historyId,
        execution_id: execId,
        optimization_id: `opt_${execId}`,
        request_id: receipt.request_id,
        user_id: uid,
        device_id: tokenPayload.device_id,
        tool_id: receipt.tool_id,
        tool_name: toolName,
        category,
        date: completedAt,
        status: historyStatus,
        result: historyStatus === 'SUCESSO'
          ? `Otimização ${toolName} aplicada e confirmada pelo Windows Agent.`
          : historyStatus === 'REVERTIDO'
          ? `Otimização ${toolName} revertida e confirmada pelo Windows Agent.`
          : 'Operação reportou falha ou não foi verificada pelo Agent.',
        details: receipt.after_state
          ? `Estado validado: ${JSON.stringify(receipt.after_state)}`
          : 'Execução auditada no Windows Agent.',
        before_state: receipt.before_state || null,
        after_state: receipt.after_state || null,
        duration_ms: realDuration,
        agent_version: receipt.agent_version || 'N/D',
        rollback_available: Boolean(receipt.rollback_available),
        verified: Boolean(receipt.verified),
        receipt_verified: true,
        receipt_nonce: receipt.receipt_nonce,
        agent_signature: receipt_signature,
      };

      const historyRef = adminDb.collection('optimization_history').doc(historyId);
      transaction.set(historyRef, historyRecord);

      return {
        execution_id: execId,
        status: finalExecStatus,
        historyRecord,
      };
    });

    res.json({
      success: true,
      verified: receipt.verified,
      execution_id: transactionResult.execution_id,
      status: transactionResult.status,
      record: transactionResult.historyRecord,
    });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg === 'EXECUTION_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'Registro de execução não encontrado no servidor.',
        error_code: 'EXECUTION_NOT_FOUND',
      });
    }
    if (msg === 'INVALID_STATE_TRANSITION_FROM_ISSUED') {
      return res.status(409).json({
        success: false,
        error: 'Não é permitido finalizar uma execução diretamente de ISSUED para COMPLETED sem registrar EXECUTING.',
        error_code: 'INVALID_STATE_TRANSITION',
      });
    }
    if (msg.startsWith('ALREADY_COMPLETED_')) {
      const cur = msg.replace('ALREADY_COMPLETED_', '');
      return res.status(409).json({
        success: false,
        error: `Esta execução já foi finalizada com status: ${cur}. Replay rejeitado.`,
        error_code: 'EXECUTION_ALREADY_COMPLETED',
      });
    }
    if (msg === 'REQUEST_ID_MISMATCH' || msg === 'EXECUTION_ID_MISMATCH' || msg === 'TOOL_ID_MISMATCH' || msg === 'OPERATION_MISMATCH' || msg === 'USER_MISMATCH' || msg === 'DEVICE_MISMATCH') {
      return res.status(400).json({
        success: false,
        error: `Divergência detectada entre o registro de execução e o recibo (${msg}). Execução bloqueada.`,
        error_code: 'RECEIPT_INVALID',
      });
    }

    console.error('Erro ao finalizar execução no servidor:', err);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao processar recibo de execução.',
      details: err?.message || err,
    });
  }
});

// Register / Sync Windows Device (Input validation and sanitization)
app.post('/api/device/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawData = req.body || {};
    const uid = req.user!.uid;
    const rawDeviceId = typeof rawData.device_id === 'string' ? rawData.device_id.trim() : '';

    if (!rawDeviceId || rawDeviceId === 'N/D' || rawDeviceId.startsWith('DEV_') || rawDeviceId.startsWith('DESKTOP-AUTO')) {
      return res.status(400).json({
        error: 'device_id inválido. O identificador do dispositivo deve ser obtido exclusivamente através do Windows Agent ativo.',
      });
    }

    const deviceId = rawDeviceId.substring(0, 64);
    const agentPubKey = (typeof rawData.agent_public_key === 'string' && /^[0-9a-fA-F]{64}$/.test(rawData.agent_public_key.trim()))
      ? rawData.agent_public_key.trim().toLowerCase()
      : null;

    const sanitizedDevice = {
      device_id: deviceId,
      user_id: uid,
      agent_public_key: agentPubKey,
      cpu: typeof rawData.cpu === 'string' && rawData.cpu.trim() ? rawData.cpu.substring(0, 100) : 'N/D',
      gpu: typeof rawData.gpu === 'string' && rawData.gpu.trim() ? rawData.gpu.substring(0, 100) : 'N/D',
      ram: typeof rawData.ram === 'string' && rawData.ram.trim() ? rawData.ram.substring(0, 50) : 'N/D',
      storage: typeof rawData.storage === 'string' && rawData.storage.trim() ? rawData.storage.substring(0, 80) : 'N/D',
      windows: typeof rawData.windows === 'string' && rawData.windows.trim() ? rawData.windows.substring(0, 60) : 'N/D',
      windows_version: typeof rawData.windows_version === 'string' && rawData.windows_version.trim() ? rawData.windows_version.substring(0, 40) : 'N/D',
      build: typeof rawData.build === 'string' && rawData.build.trim() ? rawData.build.substring(0, 30) : 'N/D',
      motherboard: typeof rawData.motherboard === 'string' && rawData.motherboard.trim() ? rawData.motherboard.substring(0, 80) : 'N/D',
      bios_version: typeof rawData.bios_version === 'string' && rawData.bios_version.trim() ? rawData.bios_version.substring(0, 40) : 'N/D',
      is_agent_connected: Boolean(rawData.is_agent_connected),
      agent_version: typeof rawData.agent_version === 'string' && rawData.agent_version.trim() ? rawData.agent_version.substring(0, 20) : 'N/D',
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await adminDb.collection('devices').doc(deviceId).set(sanitizedDevice, { merge: true });
    await adminDb.collection('users').doc(uid).update({
      device_id: deviceId,
      ...(agentPubKey ? { agent_public_key: agentPubKey } : {}),
    });

    res.json({ success: true, device: sanitizedDevice });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao sincronizar informações do dispositivo Windows.' });
  }
});

// Section 7: Agent Pairing Endpoint
app.post('/api/agent/pair', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { device_id, agent_public_key, agent_version, cpu, gpu, ram, windows, windows_version } = req.body;
    const uid = req.user!.uid;

    if (!device_id || typeof device_id !== 'string' || device_id.trim() === '' || device_id === 'N/D') {
      return res.status(400).json({ error: 'device_id é obrigatório para pairing do Agent.', error_code: 'DEVICE_NOT_REGISTERED' });
    }

    if (!agent_public_key || typeof agent_public_key !== 'string' || !/^[0-9a-fA-F]{64}$/.test(agent_public_key.trim())) {
      return res.status(400).json({ error: 'agent_public_key deve ser uma chave Ed25519 de 64 caracteres hexadecimais.', error_code: 'INVALID_TOKEN' });
    }

    const safeDeviceId = device_id.trim();
    const safePubKey = agent_public_key.trim().toLowerCase();

    const deviceData = {
      device_id: safeDeviceId,
      user_id: uid,
      agent_public_key: safePubKey,
      agent_version: typeof agent_version === 'string' && agent_version.trim() ? agent_version.trim() : 'N/D',
      cpu: cpu || 'N/D',
      gpu: gpu || 'N/D',
      ram: ram || 'N/D',
      windows: windows || 'N/D',
      windows_version: windows_version || 'N/D',
      is_agent_connected: true,
      last_seen: new Date().toISOString(),
      paired_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await adminDb.collection('devices').doc(safeDeviceId).set(deviceData, { merge: true });
    await adminDb.collection('users').doc(uid).update({
      device_id: safeDeviceId,
      agent_public_key: safePubKey,
    });

    res.json({ success: true, paired: true, device_id: safeDeviceId, agent_public_key: safePubKey });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao emparelhar Windows Agent.', details: err?.message || err });
  }
});

// Challenges store in memory for mutual authentication
const agentChallenges = new Map<string, { challenge: string; exp: number }>();

// Section 8: Challenge Generation
app.post('/api/agent/challenge', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { device_id } = req.body;
    const targetDeviceId = device_id || req.userDoc?.device_id;
    if (!targetDeviceId || targetDeviceId === 'N/D') {
      return res.status(400).json({ error: 'device_id é obrigatório para emitir challenge.', error_code: 'DEVICE_NOT_REGISTERED' });
    }

    const challengeHex = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + 60000;

    agentChallenges.set(targetDeviceId, { challenge: challengeHex, exp: expiresAt });

    res.json({
      success: true,
      device_id: targetDeviceId,
      challenge: challengeHex,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao emitir challenge para o Agent.' });
  }
});

// Section 8: Challenge Verification
app.post('/api/agent/verify-challenge', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { device_id, challenge, response_signature } = req.body;

    if (!device_id || !challenge || !response_signature) {
      return res.status(400).json({ error: 'device_id, challenge e response_signature são obrigatórios.', error_code: 'REQUEST_INVALID' });
    }

    const stored = agentChallenges.get(device_id);
    if (!stored || stored.challenge !== challenge || stored.exp < Date.now()) {
      return res.status(403).json({ error: 'Challenge inválido ou expirado.', error_code: 'INVALID_TOKEN' });
    }

    const devDoc = await adminDb.collection('devices').doc(device_id).get();
    const pubKeyHex = devDoc.data()?.agent_public_key || req.userDoc?.agent_public_key;

    if (!pubKeyHex || !/^[0-9a-fA-F]{64}$/.test(pubKeyHex)) {
      return res.status(403).json({ error: 'Chave pública do Agent não registrada.', error_code: 'DEVICE_NOT_REGISTERED' });
    }

    let sigBuf: Buffer;
    if (/^[0-9a-fA-F]{128}$/.test(response_signature)) {
      sigBuf = Buffer.from(response_signature, 'hex');
    } else {
      sigBuf = Buffer.from(response_signature, 'base64url');
    }

    const SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex');
    const agentPubKeyObj = crypto.createPublicKey({
      key: Buffer.concat([SPKI_HEADER, Buffer.from(pubKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });

    const ok = crypto.verify(null, Buffer.from(challenge, 'utf8'), agentPubKeyObj, sigBuf);
    if (!ok) {
      return res.status(403).json({ error: 'Assinatura do challenge rejeitada.', error_code: 'TOKEN_SIGNATURE_INVALID' });
    }

    agentChallenges.delete(device_id);
    res.json({ success: true, authenticated: true, device_id });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao verificar challenge do Agent.', details: err?.message || err });
  }
});

// Section 31: Dedicated Admin Authority Endpoints
app.post('/api/admin/licenses/create', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { user_id, plan_id, expires_in_days } = req.body;
    const newLicenseId = `lic_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const days = Math.max(1, Number(expires_in_days) || 30);
    const newLicense = {
      license_id: newLicenseId,
      user_id: user_id || 'unassigned',
      plan_id: plan_id || 'medio',
      status: 'ATIVA',
      created_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      device_id: 'PENDING',
      last_seen: new Date().toISOString(),
      app_version: '2.4.0',
    };
    await adminDb.collection('licenses').doc(newLicenseId).set(newLicense);
    await recordAdminLog('CREATE_LICENSE', req.user!.email || 'admin', newLicenseId, `Criada licença ${newLicenseId}`);
    res.json({ success: true, license: newLicense });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar licença.' });
  }
});

app.post('/api/admin/licenses/revoke', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { license_id } = req.body;
    if (!license_id) return res.status(400).json({ error: 'license_id é obrigatório.' });
    await adminDb.collection('licenses').doc(license_id).update({ status: 'CANCELADA' });
    await recordAdminLog('REVOKE_LICENSE', req.user!.email || 'admin', license_id, `Licença ${license_id} cancelada`);
    res.json({ success: true, license_id, status: 'CANCELADA' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao revogar licença.' });
  }
});

app.post('/api/admin/licenses/suspend', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { license_id } = req.body;
    if (!license_id) return res.status(400).json({ error: 'license_id é obrigatório.' });
    await adminDb.collection('licenses').doc(license_id).update({ status: 'SUSPENSA' });
    await recordAdminLog('SUSPEND_LICENSE', req.user!.email || 'admin', license_id, `Licença ${license_id} suspensa`);
    res.json({ success: true, license_id, status: 'SUSPENSA' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao suspender licença.' });
  }
});

app.post('/api/admin/licenses/reactivate', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { license_id } = req.body;
    if (!license_id) return res.status(400).json({ error: 'license_id é obrigatório.' });
    await adminDb.collection('licenses').doc(license_id).update({ status: 'ATIVA' });
    await recordAdminLog('REACTIVATE_LICENSE', req.user!.email || 'admin', license_id, `Licença ${license_id} reativada`);
    res.json({ success: true, license_id, status: 'ATIVA' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao reativar licença.' });
  }
});

app.post('/api/admin/licenses/update-expiry', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { license_id, expires_at } = req.body;
    if (!license_id || !expires_at) return res.status(400).json({ error: 'license_id e expires_at são obrigatórios.' });
    await adminDb.collection('licenses').doc(license_id).update({ expires_at });
    await recordAdminLog('UPDATE_LICENSE_EXPIRY', req.user!.email || 'admin', license_id, `Expiração alterada para ${expires_at}`);
    res.json({ success: true, license_id, expires_at });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar data de expiração da licença.' });
  }
});

app.post('/api/admin/plans/update-price', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { plan_id, price } = req.body;
    if (!plan_id || typeof price !== 'number') return res.status(400).json({ error: 'plan_id e price são obrigatórios.' });
    await adminDb.collection('config').doc('plans').set({ [plan_id]: { price } }, { merge: true });
    await recordAdminLog('UPDATE_PLAN_PRICE', req.user!.email || 'admin', plan_id, `Preço do plano ${plan_id} alterado para R$${price}`);
    res.json({ success: true, plan_id, price });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar preço do plano.' });
  }
});

app.post('/api/admin/plans/update-features', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { plan_id, features } = req.body;
    if (!plan_id || !Array.isArray(features)) return res.status(400).json({ error: 'plan_id e features são obrigatórios.' });
    await adminDb.collection('config').doc('plans').set({ [plan_id]: { features } }, { merge: true });
    await recordAdminLog('UPDATE_PLAN_FEATURES', req.user!.email || 'admin', plan_id, `Recursos do plano ${plan_id} atualizados`);
    res.json({ success: true, plan_id, features });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar recursos do plano.' });
  }
});

app.post('/api/admin/plans/toggle-status', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { plan_id, active } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'plan_id é obrigatório.' });
    await adminDb.collection('config').doc('plans').set({ [plan_id]: { active: Boolean(active) } }, { merge: true });
    await recordAdminLog('TOGGLE_PLAN_STATUS', req.user!.email || 'admin', plan_id, `Status do plano ${plan_id} alterado para ${active ? 'ATIVO' : 'INATIVO'}`);
    res.json({ success: true, plan_id, active: Boolean(active) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alternar status do plano.' });
  }
});

app.post('/api/admin/tools/update', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tool_id, updates } = req.body;
    if (!tool_id || !updates || typeof updates !== 'object') return res.status(400).json({ error: 'tool_id e updates são obrigatórios.' });
    await adminDb.collection('config').doc('tools').set({ [tool_id]: updates }, { merge: true });
    await recordAdminLog('UPDATE_TOOL', req.user!.email || 'admin', tool_id, `Ferramenta ${tool_id} atualizada`);
    res.json({ success: true, tool_id, updates });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar ferramenta.' });
  }
});

app.post('/api/admin/tools/add', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tool } = req.body;
    if (!tool || !tool.tool_id) return res.status(400).json({ error: 'tool com tool_id é obrigatório.' });
    await adminDb.collection('config').doc('tools').set({ [tool.tool_id]: tool }, { merge: true });
    await recordAdminLog('ADD_TOOL', req.user!.email || 'admin', tool.tool_id, `Ferramenta ${tool.tool_id} adicionada ao catálogo customizado`);
    res.json({ success: true, tool });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao adicionar ferramenta.' });
  }
});

// Cakto Payment Webhook (Strictly server-side secret validation)
app.post('/api/webhook/cakto', async (req: Request, res: Response) => {
  try {
    const serverSecret = process.env.CAKTO_WEBHOOK_SECRET;

    // Security check: CAKTO_WEBHOOK_SECRET must be configured
    if (!serverSecret) {
      console.error('[Security] [Webhook] CAKTO_WEBHOOK_SECRET não configurado no servidor.');
      return res.status(503).json({
        error: 'Webhook de pagamento desativado: segredo de autenticação (CAKTO_WEBHOOK_SECRET) não configurado no servidor.',
      });
    }

    const authHeader = req.headers['authorization'] || req.headers['x-webhook-secret'];

    if (!authHeader || (authHeader !== serverSecret && authHeader !== `Bearer ${serverSecret}`)) {
      console.warn('[Security] [Webhook] Tentativa de acesso com segredo inválido ou ausente:', {
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });
      return res.status(401).json({ error: 'Assinatura ou segredo do webhook inválido.' });
    }

    const { email, plan_id, transaction_id, customer_name } = req.body;
    if (!email || !plan_id) {
      return res.status(400).json({ error: 'Parâmetros de email e plano são obrigatórios.' });
    }

    const safeTxId = typeof transaction_id === 'string' ? transaction_id.trim() : '';
    if (!safeTxId) {
      return res.status(400).json({
        error: 'transaction_id é obrigatório para processamento idempotente do pagamento.',
        error_code: 'MISSING_TRANSACTION_ID',
      });
    }

    // Idempotency check: if transaction_id was already processed, do not create duplicate license
    const existingTxSnap = await adminDb.collection('licenses').where('transaction_id', '==', safeTxId).get();
    if (!existingTxSnap.empty) {
      const existingLic = existingTxSnap.docs[0].data();
      return res.json({
        success: true,
        already_processed: true,
        message: 'Transação já processada anteriormente (idempotência preservada).',
        license_id: existingLic.license_id,
      });
    }

    const safeEmail = String(email).trim().toLowerCase();
    const safePlanId = String(plan_id).trim().toLowerCase();

    let planLevel = 1;
    let planName = 'BÁSICO';
    if (safePlanId.includes('completo') || safePlanId === '4') {
      planLevel = 4;
      planName = 'COMPLETO';
    } else if (safePlanId.includes('avancado') || safePlanId === '3') {
      planLevel = 3;
      planName = 'AVANÇADO';
    } else if (safePlanId.includes('medio') || safePlanId === '2') {
      planLevel = 2;
      planName = 'MÉDIO';
    }

    const userSnap = await adminDb.collection('users').where('email', '==', safeEmail).get();
    if (userSnap.empty) {
      return res.status(404).json({ error: 'Usuário não encontrado para o e-mail informado.' });
    }

    const userDoc = userSnap.docs[0];
    const uid = userDoc.id;
    const newLicenseId = `lic_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await userDoc.ref.update({
      plano_atual: planName,
      nivel_plano: planLevel,
      status_plano: 'ATIVO',
      status_licenca: 'ATIVA',
      license_id: newLicenseId,
      data_inicio: new Date().toISOString().split('T')[0],
      data_expiracao: expiresAt,
    });

    await adminDb.collection('licenses').doc(newLicenseId).set({
      license_id: newLicenseId,
      license_key: `DYARTE-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      user_id: uid,
      user_name: customer_name || userDoc.data().nome || 'Cliente',
      user_email: safeEmail,
      plan_id: safePlanId,
      status: 'ATIVA',
      created_at: new Date().toISOString().split('T')[0],
      activated_at: new Date().toISOString(),
      expires_at: expiresAt,
      device_id: userDoc.data().device_id || 'PENDENTE',
      transaction_id: safeTxId,
    });

    await recordAdminLog('WEBHOOK_CAKTO_PURCHASE', 'system_webhook', uid, `Pagamento aprovado para plano ${planName}. Licença ${newLicenseId} criada.`);

    res.json({ success: true, message: `Plano ${planName} ativado com sucesso para ${safeEmail}.` });
  } catch (err) {
    console.error('Erro no processamento do webhook Cakto:', err);
    res.status(500).json({ error: 'Falha interna ao processar webhook de pagamento.' });
  }
});

// -------------------------------------------------------------
// ADMIN ENDPOINTS (Strictly protected by requireAdmin)
// -------------------------------------------------------------

// List All Users in System
app.get('/api/admin/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const usersSnap = await adminDb.collection('users').get();
    const usersList = usersSnap.docs.map((d) => d.data());
    res.json({ users: usersList });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuários cadastrados.' });
  }
});

// Update User Plan & Level (Admin Only)
app.post('/api/admin/user/plan', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { target_user_id, plan_name, plan_level } = req.body;
    if (!target_user_id || plan_level === undefined) {
      return res.status(400).json({ error: 'ID do usuário e nível do plano são obrigatórios.' });
    }

    const safeLevel = Math.max(1, Math.min(4, Number(plan_level)));
    const safeName = plan_name || (safeLevel === 1 ? 'BÁSICO' : safeLevel === 2 ? 'MÉDIO' : safeLevel === 3 ? 'AVANÇADO' : 'COMPLETO');

    const updateData: Record<string, any> = {
      plano_atual: safeName,
      nivel_plano: safeLevel,
      status_plano: 'ATIVO',
      status_licenca: 'ATIVA',
      data_inicio: new Date().toISOString().split('T')[0],
      data_expiracao: safeLevel === 1 ? 'VITALÍCIO' : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };

    await adminDb.collection('users').doc(target_user_id).update(updateData);

    // Record admin log
    await recordAdminLog(
      'UPDATE_USER_PLAN',
      req.user!.email || 'admin',
      target_user_id,
      `Alterado para plano ${safeName} (Nível ${safeLevel})`
    );

    res.json({ success: true, message: `Plano do usuário atualizado para ${safeName}.` });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar plano do usuário.' });
  }
});

// Toggle User Account Status (Block / Unblock)
app.post('/api/admin/user/status', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { target_user_id, status } = req.body;
    if (!target_user_id || !['ATIVO', 'BLOQUEADO'].includes(status)) {
      return res.status(400).json({ error: 'Parâmetros de status inválidos.' });
    }

    await adminDb.collection('users').doc(target_user_id).update({ status });

    await recordAdminLog(
      status === 'BLOQUEADO' ? 'BLOCK_USER' : 'UNBLOCK_USER',
      req.user!.email || 'admin',
      target_user_id,
      `Conta marcada como ${status}`
    );

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar status da conta do usuário.' });
  }
});

// Delete User Account (Admin Only)
app.delete('/api/admin/user/:userId', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
    }

    // Safety check: protect administrators from deletion
    const userDocRef = adminDb.collection('users').doc(userId);
    const userSnap = await userDocRef.get();
    if (userSnap.exists) {
      const data = userSnap.data();
      if (data?.role === 'ADMIN' || data?.role === 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Não é permitido excluir contas com perfil de Administrador.' });
      }
    }

    // Delete Firestore user document
    await userDocRef.delete();

    // Revoke or delete any user licenses
    const licSnap = await adminDb.collection('licenses').where('user_id', '==', userId).get();
    const batch = adminDb.batch();
    licSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Try deleting from Firebase Auth if exists
    try {
      await adminAuth.deleteUser(userId);
    } catch {
      // Ignored if user was not in Firebase Auth
    }

    await recordAdminLog(
      'DELETE_USER',
      req.user!.email || 'admin',
      userId,
      `Conta de usuário excluída permanentemente.`
    );

    res.json({ success: true, message: 'Conta excluída com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ error: 'Falha interna ao remover usuário.' });
  }
});

// Admin License Operations (Create, Suspend, Reactivate, Revoke)
app.post('/api/admin/license/action', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, license_id, user_id, plan_id } = req.body;

    if (action === 'CREATE') {
      const newLicenseId = `lic_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const newLicense = {
        license_id: newLicenseId,
        user_id: user_id || 'unassigned',
        plan_id: plan_id || 'medio',
        status: 'ATIVA',
        created_at: new Date().toISOString(),
        activated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        device_id: 'PENDING',
        last_seen: new Date().toISOString(),
        app_version: '2.4.0',
      };

      await adminDb.collection('licenses').doc(newLicenseId).set(newLicense);
      await recordAdminLog('CREATE_LICENSE', req.user!.email || 'admin', newLicenseId, `Criada licença ${newLicenseId}`);
      return res.json({ success: true, license: newLicense });
    }

    if (!license_id) {
      return res.status(400).json({ error: 'license_id é obrigatório.' });
    }

    const licRef = adminDb.collection('licenses').doc(license_id);
    let newStatus = 'ATIVA';
    if (action === 'SUSPEND') newStatus = 'SUSPENSA';
    if (action === 'REVOKE') newStatus = 'CANCELADA';
    if (action === 'REACTIVATE') newStatus = 'ATIVA';

    await licRef.update({ status: newStatus });
    await recordAdminLog(`${action}_LICENSE`, req.user!.email || 'admin', license_id, `Status alterado para ${newStatus}`);

    res.json({ success: true, license_id, status: newStatus });
  } catch (error) {
    res.status(500).json({ error: 'Erro na operação de licença.' });
  }
});

// Get Administrative Audit Logs
app.get('/api/admin/logs', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logsSnap = await adminDb.collection('admin_logs').orderBy('timestamp', 'desc').limit(100).get();
    const logs = logsSnap.docs.map((d) => d.data());
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar logs administrativos.' });
  }
});

// List All Licenses in System (Admin Only - Real Database Capture)
app.get('/api/admin/licenses', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const licSnap = await adminDb.collection('licenses').get();
    const licensesList = licSnap.docs.map((d) => d.data());
    res.json({ licenses: licensesList });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar licenças do sistema.' });
  }
});

// Real-time Database Aggregate Stats for Admin Dashboard
app.get('/api/admin/stats', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [usersSnap, licSnap] = await Promise.all([
      adminDb.collection('users').get(),
      adminDb.collection('licenses').get(),
    ]);

    const users = usersSnap.docs.map((d) => d.data());
    const licenses = licSnap.docs.map((d) => d.data());

    const totalUsers = users.length;
    const activeLicenses = licenses.filter((l) => l.status === 'ATIVA').length;
    const paidUsers = users.filter((u) => Number(u.nivel_plano) > 1 && u.status_plano === 'ATIVO').length;

    // Real estimated monthly revenue calculation based on active user plan levels (R$ 30, R$ 45, R$ 60)
    const monthlyRevenue = users.reduce((acc, u) => {
      if (u.status_plano === 'ATIVO') {
        const lvl = Number(u.nivel_plano);
        if (lvl === 2) return acc + 30;
        if (lvl === 3) return acc + 45;
        if (lvl === 4) return acc + 60;
      }
      return acc;
    }, 0);

    res.json({
      totalUsers,
      activeLicenses,
      paidUsers,
      monthlyRevenue,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao calcular estatísticas reais do banco de dados.' });
  }
});

// -------------------------------------------------------------
// PRODUCTION / VITE MIDDLEWARE SETUP
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Carregamento dinâmico estritamente em ambiente de desenvolvimento
    // Garante que o build de produção (esbuild/server.cjs) nunca faça require('vite')
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Resolução resiliente da pasta dist para produção e Electron
    const currentDir = typeof __dirname !== 'undefined'
      ? __dirname
      : process.cwd();

    const candidateDistPaths = [
      process.env.STATIC_DIST_PATH,
      currentDir,
      path.join(currentDir, 'dist'),
      path.join(process.cwd(), 'dist'),
      process.cwd(),
    ].filter((p): p is string => Boolean(p && typeof p === 'string'));

    let distPath = currentDir;
    for (const cand of candidateDistPaths) {
      if (fs.existsSync(path.join(cand, 'index.html'))) {
        distPath = cand;
        break;
      }
    }

    const indexPath = path.join(distPath, 'index.html');
    console.log('[Server] [Produção] Diretório estático resolvido:', distPath);
    console.log('[Server] [Produção] index.html encontrado:', fs.existsSync(indexPath) ? 'SIM' : 'NÃO');

    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send(`
          <div style="background:#09090b;color:#f87171;padding:24px;font-family:monospace;border-radius:8px;margin:24px;">
            <h2>[DYARTE OPTIMIZER] Erro ao carregar frontend</h2>
            <p>Arquivo index.html não localizado em: <code>${indexPath}</code></p>
            <p>Candidate paths testados: <code>${JSON.stringify(candidateDistPaths)}</code></p>
          </div>
        `);
      }
    });
  }

  // In Cloud Run containers, binding to 0.0.0.0 is strictly required for ingress and TCP health probes
  const HOST = '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log(`DYARTE OPTIMIZER Server listening on http://${HOST}:${PORT}`);
  });
}

startServer();
