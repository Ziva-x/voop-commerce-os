Get-Content "$PSScriptRoot/inspect-live-shopify.js" -Raw | flyctl ssh console -a voop-webapp -C "node"
