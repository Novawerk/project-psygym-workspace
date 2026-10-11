package io.novawerk.psygym.data.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import io.novawerk.psygym.domain.auth.SecureStore
import io.novawerk.psygym.domain.auth.SecureStoreException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The session token, encrypted with an AES key that lives in the Android Keystore and never
 * leaves it. Only the ciphertext is in a private preferences file (the app has
 * allowBackup=false; a copy would be useless anyway without the Keystore key).
 */
class KeystoreSecureStore(context: Context) : SecureStore {
    private val prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override suspend fun read(): String? = withContext(Dispatchers.IO) {
        val blob = prefs.getString(KEY, null) ?: return@withContext null
        // A blob we can't open (key gone after a restore, say) is as good as no session.
        runCatching {
            val bytes = Base64.decode(blob, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
            String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
        }.getOrNull()
    }

    // Some vendors' Keystores fail to make or use keys: that's a SecureStoreException, never a crash.
    override suspend fun write(value: String?) = withContext(Dispatchers.IO) {
        val stored = try {
            if (value == null) {
                prefs.edit().remove(KEY).commit()
            } else {
                val cipher = Cipher.getInstance(TRANSFORMATION)
                cipher.init(Cipher.ENCRYPT_MODE, key())
                val iv = cipher.iv
                check(iv.size == IV_BYTES)
                val sealed = iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
                prefs.edit().putString(KEY, Base64.encodeToString(sealed, Base64.NO_WRAP)).commit()
            }
        } catch (e: Exception) {
            throw SecureStoreException("keystore write failed", e)
        }
        if (!stored) throw SecureStoreException("preferences commit failed")
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply { init(spec) }.generateKey()
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "psygym_session"
        const val FILE = "psygym_session"
        const val KEY = "session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
