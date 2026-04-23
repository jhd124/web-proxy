export function MitmBanner() {
  return (
    <div className="mitm-banner">
      <strong>HTTPS decryption (MITM) is on.</strong> Install the local CA so browsers trust
      proxied TLS: open{' '}
      <a href="/api/mitm/ca.pem" download="proxy-mitm-ca.pem">
        /api/mitm/ca.pem
      </a>{' '}
      and add it to your system keychain (macOS: Keychain Access → import → always trust). Then
      restart the browser. Without the CA, HTTPS sites will show certificate errors.
    </div>
  )
}
