# DYARTE Windows Agent V1.1.0

Agente nativo do Windows para o **DYARTE OPTIMIZER**.

Responsável por fornecer telemetria em tempo real, inventário de hardware verificado e orquestrar operações locais de otimização e restauração no sistema operacional Windows através de um canal WebSocket local seguro (RFC 6455).

---

## 1. Arquitetura de Execução Real

O fluxo de comunicação e execução segue estritamente o modelo de autorização central:

```text
React UI (Frontend)
    ↓
Electron Desktop Runtime
    ↓
Central Backend Authorization (/api/tools/execute -> Token Ed25519)
    ↓
Central Backend START Guard (/api/executions/start -> Registrado como EXECUTANDO)
    ↓
AgentBridge (WebSocket client)
    ↓
WebSocket loopback (127.0.0.1:49152)
    ↓
dyarte-agent.exe (Windows Native Agent em C++17)
    ↓
Backup Real do Estado Atual
    ↓
Aplicação Nativa (Win32 APIs / Registry / powercfg / Process Control)
    ↓
Verificação Pós-Execução (Leitura direta do sistema)
    ↓
Canonical Agent Signed Receipt (Assinatura Ed25519 pelo Agent)
    ↓
Central Backend COMPLETE (/api/executions/complete -> Validação Criptográfica)
    ↓
React UI (Confirmação de Sucesso / Estado APLICADO ou REVERTIDO)
```

---

## 2. Tecnologias e Segurança Criptográfica

* **Linguagem & Padrão:** C++17 nativo compilado em modo Release (MSVC).
* **Interface de Rede:** Estritamente `127.0.0.1:49152` (Loopback local isolado).
* **Dependências Externas:** Zero. Binário estático e autônomo sem dependência do .NET Runtime ou runtimes externos.
* **Assinatura Ed25519 de Tokens:** O backend central assina tokens de autorização (TTL máximo de 60s) contendo:
  - `tool_id`, `user_id`, `device_id`, `operation` (APPLY ou ROLLBACK), `execution_id`, `request_id`, `nonce`, `iat`, `exp`.
* **Assinatura Ed25519 de Recibos:** O Agent assina o recibo canônico contendo:
  - `execution_id`, `request_id`, `operation`, `tool_id`, `user_id`, `device_id`, `agent_version`, `timestamp`, `duration_ms`, `before_state`, `after_state`, `verified`, `status`, `rollback_available`, `receipt_nonce`.
* **Proteção contra Replay:** Nonces de tokens e de recibos são registrados e consumidos uma única vez com expiração e descarte automático.

---

## 3. Estados Oficiais da Otimização (Section 38)

Transições estritas gerenciadas pelo backend central e refletidas na interface:

* `DISPONIVEL`: Ferramenta implementada, pronta para autorização.
* `INCOMPATIVEL`: Verificação de compatibilidade falhou (hardware, versão do Windows ou permissões).
* `JA_APLICADO`: Otimização já verificada como ativa no sistema.
* `APLICANDO`: Autorização aprovada e execução em andamento no Agent.
* `APLICADO`: Execução concluída, verificada no Windows e confirmada pelo backend.
* `REVERTENDO`: Rollback em andamento com restauração de backup original.
* `REVERTIDO`: Rollback concluído, verificado no Windows e confirmado pelo backend.
* `FALHA`: Qualquer etapa da cadeia falhou (START, Agent, Verify, Receipt ou COMPLETE).

---

## 4. Campos N/D no Inventário de Hardware (Section 13 & 62)

O DYARTE OPTIMIZER proíbe qualquer simulação ou valor fictício. Campos retornam `N/D` ou `null` quando:

* **Frequência Máxima de CPU:** Retorna `null` se a API de contadores de hardware não confirmar o clock de boost seguro.
* **Temperatura de GPU / Uso de VRAM:** Retorna `null` quando os drivers WDDM proprietários ou bibliotecas de sensores não estiverem instalados.
* **Resizable BAR / XMP / EXPO:** Retorna `N/D` por exigir chamadas de firmware UEFI/SMBIOS de baixo nível que variam conforme o fabricante da placa-mãe.
* **Primary GPU:** Retorna `null` caso nenhum adaptador esteja atrelado à flag `DISPLAY_DEVICE_PRIMARY_DEVICE` do monitor ativo.
* **Versão do Agent:** Retorna `N/D` se o agente não estiver conectado, nunca fabricando "1.0.0" ou qualquer versão fictícia.

---

## 5. Como Compilar no Windows (MSVC Release)

### Pré-requisitos:
* Windows 10 ou 11 (64-bit).
* Visual Studio 2022 com a carga de trabalho C++ desktop instalada.

### Método 1 — Via `build.bat`:
```cmd
cd agent
build.bat
```

O executável será gerado em:
```text
agent\build\Release\dyarte-agent.exe
```

### Método 2 — Via CMake:
```cmd
cd agent
cmake -B build -A x64
cmake --build build --config Release
```

---

## 6. Suíte de Testes

Os testes são organizados por escopo (Section 28):

* `tests/unit/`: Testes unitários com validação de schemas e regras isoladas.
* `tests/protocol/`: Testes de validação criptográfica de tokens Ed25519, recibos canônicos e casos de falha.
* `tests/windows/`: Testes de integração direta com Win32, CIM, powercfg e hardware nativo.
* `tests/e2e/`: Ciclo de vida completo da arquitetura com verificação fim-a-fim.
