#pragma once

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace Dyarte {
namespace Agent {

// Lightweight self-contained Ed25519 verification implementation (RFC 8032 / TweetNaCl compatible)
class Ed25519 {
private:
    typedef int64_t gf[16];

    static void set25519(gf r, const gf a) {
        for (int i = 0; i < 16; i++) r[i] = a[i];
    }

    static void car25519(gf o) {
        int64_t c;
        for (int i = 0; i < 16; i++) {
            o[i] += (1LL << 16);
            c = o[i] >> 16;
            o[(i + 1) * (i < 15 ? 1 : 0)] += c - 1 + 37 * (c - 1) * (i == 15 ? 1 : 0);
            o[i] -= c << 16;
        }
    }

    static void sel25519(gf p, gf q, int b) {
        int64_t c = ~(b - 1);
        for (int i = 0; i < 16; i++) {
            int64_t t = c & (p[i] ^ q[i]);
            p[i] ^= t;
            q[i] ^= t;
        }
    }

    static void pack25519(uint8_t* o, const gf n) {
        gf m, t;
        set25519(t, n);
        car25519(t);
        car25519(t);
        car25519(t);
        for (int j = 0; j < 2; j++) {
            m[0] = t[0] - 0xffed;
            for (int i = 1; i < 15; i++) {
                m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
                m[i - 1] &= 0xffff;
            }
            m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
            m[14] &= 0xffff;
            int64_t b = (m[15] >> 16) & 1;
            m[15] &= 0xffff;
            sel25519(t, m, 1 - b);
        }
        for (int i = 0; i < 16; i++) {
            o[2 * i] = t[i] & 0xff;
            o[2 * i + 1] = t[i] >> 8;
        }
    }

    static int par25519(const gf a) {
        uint8_t d[32];
        pack25519(d, a);
        return d[0] & 1;
    }

    static int unpack25519(gf o, const uint8_t* n) {
        for (int i = 0; i < 16; i++) {
            o[i] = n[2 * i] + (static_cast<int64_t>(n[2 * i + 1]) << 8);
        }
        o[15] &= 0x7fff;
        return 0;
    }

    static void A(gf o, const gf a, const gf b) {
        for (int i = 0; i < 16; i++) o[i] = a[i] + b[i];
    }

    static void Z(gf o, const gf a, const gf b) {
        for (int i = 0; i < 16; i++) o[i] = a[i] - b[i];
    }

    static void M(gf o, const gf a, const gf b) {
        int64_t t[31] = {0};
        for (int i = 0; i < 16; i++) {
            for (int j = 0; j < 16; j++) {
                t[i + j] += a[i] * b[j];
            }
        }
        for (int i = 0; i < 15; i++) {
            t[i] += 38 * t[i + 16];
        }
        for (int i = 0; i < 16; i++) o[i] = t[i];
        car25519(o);
        car25519(o);
    }

    static void S(gf o, const gf a) {
        M(o, a, a);
    }

    static void inv25519(gf o, const gf i) {
        gf c;
        for (int a = 0; a < 16; a++) c[a] = i[a];
        for (int a = 253; a >= 0; a--) {
            S(c, c);
            if (a != 2 && a != 4) M(c, c, i);
        }
        for (int a = 0; a < 16; a++) o[a] = c[a];
    }

    static void pow2523(gf o, const gf i) {
        gf c;
        for (int a = 0; a < 16; a++) c[a] = i[a];
        for (int a = 250; a >= 0; a--) {
            S(c, c);
            if (a != 1) M(c, c, i);
        }
        for (int a = 0; a < 16; a++) o[a] = c[a];
    }

    // SHA-512 implementation
    static uint64_t rotr64(uint64_t x, int n) {
        return (x >> n) | (x << (64 - n));
    }

    static void sha512_block(uint64_t state[8], const uint8_t block[128]) {
        static const uint64_t K[80] = {
            0x428a2f98d728ae22ULL, 0x7137449123ef65cdULL, 0xb5c0fbcfec4d3b2fULL, 0xe9b5dba58189dbbcULL,
            0x3956c25bf348b538ULL, 0x59f111f1b605d019ULL, 0x923f82a4af194f9bULL, 0xab1c5ed5da6d8118ULL,
            0xd807aa98a3030242ULL, 0x12835b0145706fbeULL, 0x243185be4ee4b28cULL, 0x550c7dc3d5ffb4e2ULL,
            0x72be5d74f27b896fULL, 0x80deb1fe3b1696b1ULL, 0x9bdc06a725c71235ULL, 0xc19bf174cf692694ULL,
            0xe49b69c19ef14ad2ULL, 0xefbe4786384f25e3ULL, 0x0fc19dc68b8cd5b5ULL, 0x240ca1cc77ac9c65ULL,
            0x2de92c6f592b0275ULL, 0x4a7484aa6ea6e483ULL, 0x5cb0a9dcbd41fbd4ULL, 0x76f988da831153b5ULL,
            0x983e5152ee66dfabULL, 0xa831c66d2db43210ULL, 0xb00327c898fb213fULL, 0xbf597fc7beef0ee4ULL,
            0xc6e00bf33da88fc2ULL, 0xd5a79147930aa725ULL, 0x06ca6351e003826fULL, 0x142929670a0e6e70ULL,
            0x27b70a8546d22ffcULL, 0x2e1b21385c26c926ULL, 0x4d2c6dfc5ac42aedULL, 0x53380d139d95b3dfULL,
            0x650a73548baf63deULL, 0x766a0abb3c77b2a8ULL, 0x81c2c92e47867a1ULL, 0x92722c851482353bULL,
            0x9c30d53254ff53a5ULL, 0xa2bfe8a14cf10364ULL, 0xa81a664bbc423001ULL, 0xc24b8b70d0f89791ULL,
            0xc76c51a30654be30ULL, 0xd192e819d6ef5218ULL, 0xd69906495565a910ULL, 0xf40e35855771202aULL,
            0x106aa07032bbd1b8ULL, 0x19a4c116b8d2d0c8ULL, 0x1e376c085141ab53ULL, 0x2748774cdf8eeeb9ULL,
            0x34b0bcb5e19b48a8ULL, 0x391c0cb3c5c95a63ULL, 0x4ed8aa4ae3418acbULL, 0x5b9cca4f7763e373ULL,
            0x682e6ff3d6b2b8a3ULL, 0x748f82ee5defb2fcULL, 0x78a5636f43172f60ULL, 0x84c87814a1f0ab72ULL,
            0x8cc702081a6439ecULL, 0x90befffa23631e28ULL, 0xa4506cebde82bde9ULL, 0xbef9a3f7b2c67915ULL,
            0xc67178f2e372532bULL, 0xca273eceea26619cULL, 0xd186b8c321c0c207ULL, 0xeada7dd6cde0eb1eULL,
            0xf57d4f7fee6ed178ULL, 0x06f067aa72176fbaULL, 0x0a637dc5a2c898a6ULL, 0x113f9804bef90daeULL,
            0x1b710b35131c471bULL, 0x28db77f523047d84ULL, 0x32caab7b40c72493ULL, 0x3c9ebe0a15c9bebcULL,
            0x431d67c49c100d4cULL, 0x4cc5d4becb3e42b6ULL, 0x597f299cfc657e2aULL, 0x5fcb6fab3ad6faecULL
        };

        uint64_t W[80];
        for (int i = 0; i < 16; i++) {
            W[i] = (static_cast<uint64_t>(block[i * 8]) << 56) |
                   (static_cast<uint64_t>(block[i * 8 + 1]) << 48) |
                   (static_cast<uint64_t>(block[i * 8 + 2]) << 40) |
                   (static_cast<uint64_t>(block[i * 8 + 3]) << 32) |
                   (static_cast<uint64_t>(block[i * 8 + 4]) << 24) |
                   (static_cast<uint64_t>(block[i * 8 + 5]) << 16) |
                   (static_cast<uint64_t>(block[i * 8 + 6]) << 8) |
                   (static_cast<uint64_t>(block[i * 8 + 7]));
        }

        for (int i = 16; i < 80; i++) {
            uint64_t s0 = rotr64(W[i - 15], 1) ^ rotr64(W[i - 15], 8) ^ (W[i - 15] >> 7);
            uint64_t s1 = rotr64(W[i - 2], 19) ^ rotr64(W[i - 2], 61) ^ (W[i - 2] >> 6);
            W[i] = W[i - 16] + s0 + W[i - 7] + s1;
        }

        uint64_t a = state[0], b = state[1], c = state[2], d = state[3];
        uint64_t e = state[4], f = state[5], g = state[6], h = state[7];

        for (int i = 0; i < 80; i++) {
            uint64_t S1 = rotr64(e, 14) ^ rotr64(e, 18) ^ rotr64(e, 41);
            uint64_t ch = (e & f) ^ ((~e) & g);
            uint64_t temp1 = h + S1 + ch + K[i] + W[i];
            uint64_t S0 = rotr64(a, 28) ^ rotr64(a, 34) ^ rotr64(a, 39);
            uint64_t maj = (a & b) ^ (a & c) ^ (b & c);
            uint64_t temp2 = S0 + maj;

            h = g;
            g = f;
            f = e;
            e = d + temp1;
            d = c;
            c = b;
            b = a;
            a = temp1 + temp2;
        }

        state[0] += a; state[1] += b; state[2] += c; state[3] += d;
        state[4] += e; state[5] += f; state[6] += g; state[7] += h;
    }

    static void sha512(uint8_t out[64], const uint8_t* in, size_t inlen) {
        uint64_t state[8] = {
            0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL, 0x3c6ef372fe94f82bULL, 0xa54ff53a5f1d36f1ULL,
            0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL, 0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL
        };

        size_t offset = 0;
        while (inlen - offset >= 128) {
            sha512_block(state, in + offset);
            offset += 128;
        }

        uint8_t pad[256] = {0};
        size_t rem = inlen - offset;
        std::memcpy(pad, in + offset, rem);
        pad[rem] = 0x80;

        size_t padLen = (rem < 112) ? 128 : 256;
        uint64_t bitLen = static_cast<uint64_t>(inlen) * 8;
        for (int i = 0; i < 8; i++) {
            pad[padLen - 1 - i] = static_cast<uint8_t>((bitLen >> (i * 8)) & 0xff);
        }

        sha512_block(state, pad);
        if (padLen == 256) {
            sha512_block(state, pad + 128);
        }

        for (int i = 0; i < 8; i++) {
            for (int j = 0; j < 8; j++) {
                out[i * 8 + j] = static_cast<uint8_t>((state[i] >> ((7 - j) * 8)) & 0xff);
            }
        }
    }

    static void modL(uint8_t* r, int64_t* x) {
        static const int64_t L[32] = {
            0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58,
            0xd0, 0xce, 0xcd, 0x60, 0xb8, 0x04, 0xde, 0x71,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10
        };
        for (int i = 63; i >= 32; i--) {
            int64_t carry = 0;
            for (int j = i - 32, k = i - 12; j < k; j++) {
                x[j] += carry - 16 * x[i] * L[j - (i - 32)];
                carry = (x[j] + 128) >> 8;
                x[j] -= carry << 8;
            }
            x[i - 12] += carry;
            x[i] = 0;
        }
        int64_t carry = 0;
        for (int j = 0; j < 32; j++) {
            x[j] += carry - (x[31] >> 4) * L[j];
            carry = x[j] >> 8;
            x[j] &= 0xff;
        }
        for (int j = 0; j < 32; j++) {
            x[j] -= carry * L[j];
            r[j] = static_cast<uint8_t>(x[j] & 0xff);
        }
    }

    static void reduce(uint8_t* r) {
        int64_t x[64];
        for (int i = 0; i < 64; i++) x[i] = static_cast<int64_t>(r[i]);
        for (int i = 0; i < 64; i++) r[i] = 0;
        modL(r, x);
    }

    static void add(gf p[4], gf q[4]) {
        static const gf d2 = {
            -21827, 11140, -28204, -9497, -25468, 7377, -20462, 8459,
            -27647, 9660, -24861, 3521, -19965, 11970, -9978, -1815
        };
        gf a, b, c, d, e, f, g, h;
        Z(a, p[1], p[0]);
        Z(t0, q[1], q[0]);
        M(a, a, t0);
        A(b, p[1], p[0]);
        A(t0, q[1], q[0]);
        M(b, b, t0);
        M(c, p[3], q[3]);
        M(c, c, d2);
        M(d, p[2], q[2]);
        A(d, d, d);
        Z(e, b, a);
        Z(f, d, c);
        A(g, d, c);
        A(h, b, a);
        M(p[0], e, f);
        M(p[1], h, g);
        M(p[2], g, f);
        M(p[3], e, h);
    }

    static int unpackneg(gf r[4], const uint8_t p[32]) {
        static const gf d = {
            -10913, 5570, -14102, -4749, -12734, 3688, -10231, 4229,
            -13824, 4830, -12431, 1760, -9983, 5985, -4990, -908
        };
        static const gf I = {
            -32535, 16624, -3207, -32289, 32043, -1375, 2762, 32102,
            -31841, -19269, 22443, -600, 31255, -7332, 7308, -16149
        };
        gf t, chk, num, den, den2, den4, den6;
        set25519(r[2], gf0);
        r[2][0] = 1;
        unpack25519(r[1], p);
        S(num, r[1]);
        M(den, num, d);
        Z(num, num, r[2]);
        A(den, r[2], den);

        S(den2, den);
        S(den4, den2);
        M(den6, den4, den2);
        M(t, den6, num);
        M(t, t, den);

        pow2523(t, t);
        M(t, t, num);
        M(t, t, den);
        M(t, t, den);
        M(r[0], t, den);

        S(chk, r[0]);
        M(chk, chk, den);
        if (neq25519(chk, num)) M(r[0], r[0], I);

        S(chk, r[0]);
        M(chk, chk, den);
        if (neq25519(chk, num)) return -1;

        if (par25519(r[0]) == (p[31] >> 7)) Z(r[0], gf0, r[0]);

        M(r[3], r[0], r[1]);
        return 0;
    }

    static int neq25519(const gf a, const gf b) {
        uint8_t c[32], d[32];
        pack25519(c, a);
        pack25519(d, b);
        int diff = 0;
        for (int i = 0; i < 32; i++) diff |= (c[i] ^ d[i]);
        return diff != 0;
    }

    static const gf gf0;
    static gf t0;

    static void scalarmult(gf p[4], gf q[4], const uint8_t* s) {
        set25519(p[0], gf0);
        set25519(p[1], gf0);
        p[1][0] = 1;
        set25519(p[2], gf0);
        p[2][0] = 1;
        set25519(p[3], gf0);

        for (int i = 255; i >= 0; i--) {
            int b = (s[i / 8] >> (i & 7)) & 1;
            sel25519(p[0], q[0], b);
            sel25519(p[1], q[1], b);
            sel25519(p[2], q[2], b);
            sel25519(p[3], q[3], b);
            add(q, p);
            add(p, p);
            sel25519(p[0], q[0], b);
            sel25519(p[1], q[1], b);
            sel25519(p[2], q[2], b);
            sel25519(p[3], q[3], b);
        }
    }

public:
    /**
     * Derives a 32-byte Ed25519 public key and 64-byte secret key from a 32-byte seed.
     * Compatible with RFC 8032 and TweetNaCl crypto_sign_seed_keypair.
     */
    static void KeypairFromSeed(uint8_t pk[32], uint8_t sk[64], const uint8_t seed[32]) {
        static const gf Bx = {
            -14913, -15377, 9370, 7112, -8233, -19491, 4016, -11281,
            -24151, -4414, 12690, -11937, 23971, -12745, -7374, -9879
        };
        static const gf By = {
            -23003, 13470, 11786, 257, 15961, -30198, 27894, 10081,
            24295, 1526, -4226, -13770, 7752, 19875, -20534, 1014
        };

        uint8_t d[64];
        gf p[4];

        sha512(d, seed, 32);
        d[0] &= 248;
        d[31] &= 127;
        d[31] |= 64;

        set25519(p[0], Bx);
        set25519(p[1], By);
        set25519(p[2], gf0);
        p[2][0] = 1;
        M(p[3], Bx, By);

        scalarmult(p, p, d);
        inv25519(p[2], p[2]);
        M(p[1], p[1], p[2]);
        M(p[0], p[0], p[2]);
        pack25519(pk, p[1]);
        pk[31] ^= static_cast<uint8_t>(par25519(p[0]) << 7);

        for (int i = 0; i < 32; ++i) sk[i] = seed[i];
        for (int i = 0; i < 32; ++i) sk[32 + i] = pk[i];
    }

    /**
     * Signs message with 64-byte secret key (first 32 bytes seed, last 32 bytes pk).
     * Output sig is 64 bytes.
     * Compatible with RFC 8032 and TweetNaCl crypto_sign_detached.
     */
    static void Sign(uint8_t sig[64], const uint8_t* msg, size_t msglen, const uint8_t sk[64]) {
        static const gf Bx = {
            -14913, -15377, 9370, 7112, -8233, -19491, 4016, -11281,
            -24151, -4414, 12690, -11937, 23971, -12745, -7374, -9879
        };
        static const gf By = {
            -23003, 13470, 11786, 257, 15961, -30198, 27894, 10081,
            24295, 1526, -4226, -13770, 7752, 19875, -20534, 1014
        };

        uint8_t d[64], h[64], r[64];
        gf p[4];
        int64_t x[64];

        sha512(d, sk, 32);
        d[0] &= 248;
        d[31] &= 127;
        d[31] |= 64;

        std::vector<uint8_t> sm(64 + msglen);
        for (size_t i = 0; i < msglen; ++i) sm[64 + i] = msg[i];
        for (size_t i = 0; i < 32; ++i) sm[32 + i] = d[32 + i];
        sha512(r, sm.data() + 32, msglen + 32);
        reduce(r);

        set25519(p[0], Bx);
        set25519(p[1], By);
        set25519(p[2], gf0);
        p[2][0] = 1;
        M(p[3], Bx, By);
        scalarmult(p, p, r);
        inv25519(p[2], p[2]);
        M(p[1], p[1], p[2]);
        M(p[0], p[0], p[2]);
        pack25519(sig, p[1]);
        sig[31] ^= static_cast<uint8_t>(par25519(p[0]) << 7);

        for (size_t i = 0; i < 32; ++i) sm[i] = sig[i];
        for (size_t i = 0; i < 32; ++i) sm[32 + i] = sk[32 + i];
        sha512(h, sm.data(), msglen + 64);
        reduce(h);

        for (size_t i = 0; i < 64; ++i) x[i] = 0;
        for (size_t i = 0; i < 32; ++i) x[i] = static_cast<int64_t>(r[i]);
        for (size_t i = 0; i < 32; ++i) {
            for (size_t j = 0; j < 32; ++j) {
                x[i + j] += static_cast<int64_t>(h[i]) * static_cast<int64_t>(d[j]);
            }
        }
        modL(sig + 32, x);
    }

    /**
     * Verifies a 64-byte Ed25519 signature on message using the 32-byte public key.
     * Returns true if valid, false otherwise.
     */
    static bool Verify(const uint8_t sig[64], const uint8_t* msg, size_t msglen, const uint8_t pk[32]) {
        static const gf Bx = {
            -14913, -15377, 9370, 7112, -8233, -19491, 4016, -11281,
            -24151, -4414, 12690, -11937, 23971, -12745, -7374, -9879
        };
        static const gf By = {
            -23003, 13470, 11786, 257, 15961, -30198, 27894, 10081,
            24295, 1526, -4226, -13770, 7752, 19875, -20534, 1014
        };

        uint8_t h[64];
        uint8_t rcheck[32];
        gf p[4], q[4];

        if (unpackneg(q, pk) != 0) return false;

        std::vector<uint8_t> sm(64 + msglen);
        std::memcpy(sm.data(), sig, 32);
        std::memcpy(sm.data() + 32, pk, 32);
        std::memcpy(sm.data() + 64, msg, msglen);

        sha512(h, sm.data(), 64 + msglen);
        reduce(h);

        set25519(p[0], Bx);
        set25519(p[1], By);
        set25519(p[2], gf0);
        p[2][0] = 1;
        M(p[3], Bx, By);

        scalarmult(p, q, sig + 32);
        scalarmult(q, q, h);
        add(p, q);

        pack25519(rcheck, p[1]);
        inv25519(p[2], p[2]);
        M(p[1], p[1], p[2]);
        pack25519(rcheck, p[1]);

        int diff = 0;
        for (int i = 0; i < 32; i++) {
            diff |= (rcheck[i] ^ sig[i]);
        }

        return diff == 0;
    }
};

inline const Ed25519::gf Ed25519::gf0 = {0};
inline Ed25519::gf Ed25519::t0 = {0};

} // namespace Agent
} // namespace Dyarte
