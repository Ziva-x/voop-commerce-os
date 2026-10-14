import type { Metadata, Viewport } from "next";
import { ClientLayout } from "@/components/ClientLayout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOOP OS | Universal Commerce & Profit Engine",
  description: "Unified commerce OS for Shopify sync, inventory, purchases, P&L, courier scanner, and creator collabs.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0B1120",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiKey = process.env.SHOPIFY_API_KEY || "9e75868a20c3b7712800a03fbb4e89e2";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Shopify App Bridge Loader */}
        <script
          id="voop-app-bridge-loader"
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                window.addEventListener("error", function(e) {
                  if (e && e.message && e.message.indexOf("startTime") !== -1) {
                    e.stopImmediatePropagation();
                  }
                });
              } catch(_err) {}
              try {
                var isIframe = false;
                try { isIframe = window.top !== window.self; } catch(e) { isIframe = true; }
                if (!isIframe) {
                  return;
                }

                var params = new URLSearchParams(window.location.search);
                var urlShop = params.get("shop");
                var urlHost = params.get("host");
                var storageShop = sessionStorage.getItem("voop_embedded_shop");
                var storageHost = sessionStorage.getItem("voop_embedded_host");

                if (urlShop && storageShop && urlShop !== storageShop) {
                  sessionStorage.removeItem("voop.voopStoreId");
                  sessionStorage.removeItem("voop.activeStoreId");
                  sessionStorage.removeItem("voop.publicStoreRef");
                  sessionStorage.removeItem("voop_active_store_id");
                  sessionStorage.removeItem("voop_active_voop_store_id");
                  sessionStorage.removeItem("voop_active_public_store_ref");
                }

                var host = urlHost || storageHost;
                var shop = urlShop || storageShop;
                var embedded = params.get("embedded") === "1" || sessionStorage.getItem("voop_is_embedded") === "true";

                if (!shop && host) {
                  try {
                    var decoded = atob(host).split("/")[0];
                    if (decoded && decoded.indexOf(".") !== -1) shop = decoded;
                  } catch(_e) {}
                }

                if (shop || host || embedded || isIframe) {
                  sessionStorage.setItem("voop_is_embedded", "true");
                  if (shop) sessionStorage.setItem("voop_embedded_shop", shop);
                  if (host) sessionStorage.setItem("voop_embedded_host", host);

                  var metaKey = document.createElement("meta");
                  metaKey.name = "shopify-api-key";
                  metaKey.content = ${JSON.stringify(apiKey)};
                  document.head.appendChild(metaKey);

                  if (shop) {
                    var metaShop = document.createElement("meta");
                    metaShop.name = "shopify-shop";
                    metaShop.content = shop;
                    document.head.appendChild(metaShop);
                  }

                  var script = document.createElement("script");
                  script.src = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
                  script.async = false;
                  document.head.appendChild(script);
                }
              } catch(e) {
                console.error("[VOOP App Bridge Loader] Initialization error:", e);
              }
            })();`,
          }}
        />
        {/* Instant Pre-Hydration Theme Script (Light vs Dark Only) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var params=new URLSearchParams(window.location.search);
              var qTheme=params.get("theme");
              if(qTheme==="light"||qTheme==="dark"){
                sessionStorage.setItem("voop.tab_mode",qTheme);
              }
              var tabMode=sessionStorage.getItem("voop.tab_mode");
              var prefMode=localStorage.getItem("voop_user_mode");
              var rawMode=qTheme||tabMode||prefMode||"dark";
              var mode=(rawMode==="light"||rawMode==="light:modern")?"light":"dark";
              var isDark=mode==="dark";

              var tabStyle=sessionStorage.getItem("voop.tab_style");
              var prefStyle=localStorage.getItem("voop_user_style");
              var style="modern";

              document.documentElement.dataset.theme=mode;
              document.documentElement.setAttribute("data-theme",mode);
              document.documentElement.dataset.mode=mode;
              document.documentElement.setAttribute("data-mode",mode);
              document.documentElement.dataset.style=style;
              document.documentElement.setAttribute("data-style",style);

              if(isDark){
                document.documentElement.classList.add("dark");
                document.documentElement.classList.remove("light");
                document.documentElement.style.colorScheme="dark";
              }else{
                document.documentElement.classList.remove("dark");
                document.documentElement.classList.add("light");
                document.documentElement.style.colorScheme="light";
              }
            }catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased overflow-hidden m-0 p-0 font-sans" suppressHydrationWarning>
        <AuthProvider>
          <ThemeProvider>
            <ClientLayout>{children}</ClientLayout>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
