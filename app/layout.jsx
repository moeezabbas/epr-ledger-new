import './globals.css'

export const metadata = {
  title: 'ERP Ledger System',
  description: 'Google Sheets Synced Ledger Management System',
  keywords: 'ERP, Ledger, Google Sheets, Accounting, Business Management',
  manifest: '/manifest.json',
  themeColor: '#000000',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
         <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
