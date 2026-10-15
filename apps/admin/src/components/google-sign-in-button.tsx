import * as React from "react"
import { useTheme } from "next-themes"

const GIS_SRC = "https://accounts.google.com/gsi/client"

type GoogleAccountsId = {
  initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void
  renderButton(
    parent: HTMLElement,
    options: { theme?: "outline" | "filled_black"; size?: "large"; text?: "signin_with"; width?: number; locale?: string },
  ): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

let gisPromise: Promise<void> | null = null

function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve()
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gisPromise = null
      reject(new Error("Google 登录加载不了。请检查网络，或者浏览器的拦截插件。"))
    }
    document.head.appendChild(script)
  })
  return gisPromise
}

/** Google's own "Sign in with Google" button. Hands the ID token to `onCredential`. */
export function GoogleSignInButton({
  clientId,
  onCredential,
  onError,
}: {
  clientId: string
  onCredential: (credential: string) => void
  onError: (message: string) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const callbacks = React.useRef({ onCredential, onError })
  callbacks.current = { onCredential, onError }

  React.useEffect(() => {
    let cancelled = false
    loadGis()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => callbacks.current.onCredential(response.credential),
        })
        ref.current.replaceChildren()
        window.google.accounts.id.renderButton(ref.current, {
          theme: resolvedTheme === "dark" ? "filled_black" : "outline",
          size: "large",
          text: "signin_with",
          width: 288,
          locale: "zh_CN",
        })
      })
      .catch((error: Error) => callbacks.current.onError(error.message))
    return () => {
      cancelled = true
    }
  }, [clientId, resolvedTheme])

  return <div ref={ref} className="flex h-11 justify-center" />
}
