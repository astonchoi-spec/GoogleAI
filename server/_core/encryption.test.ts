import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, hash } from './encryption';

describe('Encryption Utility', () => {
  beforeAll(() => {
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
    }
  });

  it('should encrypt and decrypt data correctly', () => {
    const plaintext = 'sk-proj-1234567890abcdefghijklmnopqrst';
    
    const encrypted = encrypt(plaintext);
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(plaintext);
    expect(typeof encrypted).toBe('string');
    
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext (due to random IV)', () => {
    const plaintext = 'test-api-key-12345';
    
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);
    
    // Different IVs should produce different ciphertexts
    expect(encrypted1).not.toBe(encrypted2);
    
    // But both should decrypt to the same plaintext
    expect(decrypt(encrypted1)).toBe(plaintext);
    expect(decrypt(encrypted2)).toBe(plaintext);
  });

  it('should handle special characters in plaintext', () => {
    const plaintext = 'sk-ant-v0.1.2!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    
    expect(decrypted).toBe(plaintext);
  });

  it('should hash values consistently', () => {
    const value = 'test-value';
    
    const hash1 = hash(value);
    const hash2 = hash(value);
    
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(value);
  });

  it('should throw error on invalid encrypted data', () => {
    expect(() => {
      decrypt('invalid-base64-data!@#$');
    }).toThrow();
  });

  it('should handle corrupted encrypted data gracefully', () => {
    const plaintext = 'test-data';
    const encrypted = encrypt(plaintext);
    
    // Corrupt the encrypted data by removing last character
    const corrupted = encrypted.slice(0, -1);
    
    // Corrupted data may throw or return garbage - both are acceptable
    try {
      const result = decrypt(corrupted);
      // If it doesn't throw, it should not match original
      expect(result).not.toBe(plaintext);
    } catch (error) {
      // Expected behavior
      expect(error).toBeDefined();
    }
  });
});
