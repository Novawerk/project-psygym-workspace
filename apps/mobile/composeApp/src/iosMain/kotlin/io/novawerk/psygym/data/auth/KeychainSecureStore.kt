package io.novawerk.psygym.data.auth

import io.novawerk.psygym.domain.auth.SecureStore
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.alloc
import kotlinx.cinterop.convert
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.readBytes
import kotlinx.cinterop.reinterpret
import kotlinx.cinterop.usePinned
import kotlinx.cinterop.value
import platform.CoreFoundation.CFDataCreate
import platform.CoreFoundation.CFDataGetBytePtr
import platform.CoreFoundation.CFDataGetLength
import platform.CoreFoundation.CFDataRef
import platform.CoreFoundation.CFDictionaryAddValue
import platform.CoreFoundation.CFDictionaryCreateMutable
import platform.CoreFoundation.CFMutableDictionaryRef
import platform.CoreFoundation.CFRelease
import platform.CoreFoundation.CFStringCreateWithCString
import platform.CoreFoundation.CFTypeRef
import platform.CoreFoundation.CFTypeRefVar
import platform.CoreFoundation.kCFBooleanTrue
import platform.CoreFoundation.kCFStringEncodingUTF8
import platform.CoreFoundation.kCFTypeDictionaryKeyCallBacks
import platform.CoreFoundation.kCFTypeDictionaryValueCallBacks
import platform.Security.SecItemAdd
import platform.Security.SecItemCopyMatching
import platform.Security.SecItemDelete
import platform.Security.errSecSuccess
import platform.Security.kSecAttrAccessible
import platform.Security.kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
import platform.Security.kSecAttrAccount
import platform.Security.kSecAttrService
import platform.Security.kSecClass
import platform.Security.kSecClassGenericPassword
import platform.Security.kSecMatchLimit
import platform.Security.kSecMatchLimitOne
import platform.Security.kSecReturnData
import platform.Security.kSecValueData

/**
 * The session token in the iOS Keychain, as a generic password readable after the first unlock
 * and only on this device (so it isn't carried into backups or onto a new phone).
 */
@OptIn(ExperimentalForeignApi::class)
class KeychainSecureStore : SecureStore {

    override suspend fun read(): String? = memScoped {
        val query = query(kSecReturnData to kCFBooleanTrue, kSecMatchLimit to kSecMatchLimitOne)
        val result = alloc<CFTypeRefVar>()
        val status = SecItemCopyMatching(query, result.ptr)
        CFRelease(query)
        val data: CFDataRef = result.value?.reinterpret() ?: return null
        try {
            if (status != errSecSuccess) return null
            val length = CFDataGetLength(data).toInt()
            CFDataGetBytePtr(data)?.readBytes(length)?.decodeToString()
        } finally {
            CFRelease(data)
        }
    }

    override suspend fun write(value: String?) {
        val base = query()
        SecItemDelete(base)
        CFRelease(base)
        if (value == null) return
        val bytes = value.encodeToByteArray()
        val data = bytes.usePinned { CFDataCreate(null, it.addressOf(0).reinterpret(), bytes.size.convert()) }
        val add = query(kSecValueData to data, kSecAttrAccessible to kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
        SecItemAdd(add, null)
        CFRelease(add)
        CFRelease(data)
    }

    /** The item's address (class, service, account) plus [extra] pairs. Release the result. */
    private fun query(vararg extra: Pair<CFTypeRef?, CFTypeRef?>): CFMutableDictionaryRef? {
        val dict = CFDictionaryCreateMutable(null, 0, kCFTypeDictionaryKeyCallBacks.ptr, kCFTypeDictionaryValueCallBacks.ptr)
        val service = CFStringCreateWithCString(null, SERVICE, kCFStringEncodingUTF8)
        val account = CFStringCreateWithCString(null, ACCOUNT, kCFStringEncodingUTF8)
        CFDictionaryAddValue(dict, kSecClass, kSecClassGenericPassword)
        CFDictionaryAddValue(dict, kSecAttrService, service)
        CFDictionaryAddValue(dict, kSecAttrAccount, account)
        extra.forEach { (k, v) -> CFDictionaryAddValue(dict, k, v) }
        // The dictionary retains what it holds.
        CFRelease(service)
        CFRelease(account)
        return dict
    }

    private companion object {
        const val SERVICE = "io.novawerk.psygym.session"
        const val ACCOUNT = "session"
    }
}
