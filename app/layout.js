export const metadata = {
  title: "Stillwater — a private self-reflection tool",
  description:
    "A quiet, structured set of questions to reflect on patterns of attraction and identity. Not a diagnosis — only you define your identity.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
