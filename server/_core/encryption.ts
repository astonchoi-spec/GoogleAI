/**
 * Encryption utilities for sensitive data (API keys, tokens)
 * Uses Node.js crypto for AES-256-GCM encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// Ensure key is 32 bytes for AES-256
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required for API key encryption. ' +
      'Set it to a 32-character string in your environment.'
    );
  }
  
  if (key.length < 32) {
    throw new Error(
      `ENCRYPTION_KEY must be at least 32 characters long. Current length: ${key.length}`
    );
  }
  
  return Buffer.from(key.slice(0, 32));
}

/**
 * Encrypt sensitive data
 * Returns: base64(iv + ciphertext + authTag)
 */
export function encrypt(plaintext: string): string {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine iv + ciphertext + authTag and encode as base64
    const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex'), authTag]);
    return combined.toString('base64');
  } catch (error) {
    console.error('[Encryption] Failed to encrypt:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt sensitive data
 * Expects: base64(iv + ciphertext + authTag)
 */
export function decrypt(encryptedData: string): string {
  try {
    const combined = Buffer.from(encryptedData, 'base64');
    if (combined.length < 32) {
      throw new Error('Encrypted payload too short');
    }
    
    // Extract components
    const iv = combined.slice(0, 16);
    const authTag = combined.slice(-16);
    const ciphertext = combined.slice(16, -16);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv, {
      authTagLength: 16,
    });
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Decryption failed');
  }
}

/**
 * Hash a value for comparison (one-way)
 */
export function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
