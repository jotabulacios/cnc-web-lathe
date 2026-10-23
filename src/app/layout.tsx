import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'Torno CNC · Laboratorio X/Z',description:'Primer laboratorio educativo X/Z con motor Rust y WebAssembly.' };
export default function RootLayout({ children }:Readonly<{children:React.ReactNode}>) {
  return <html lang="es"><body>{children}</body></html>;
}
