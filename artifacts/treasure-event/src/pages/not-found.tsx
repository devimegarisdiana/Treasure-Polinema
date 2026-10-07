import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F7F5F3]">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-[#8F4A3C]" />
            <h1 className="text-2xl font-bold text-[#39373F]">
              Halaman tidak ditemukan
            </h1>
          </div>

          <p className="mt-4 text-sm text-[#625D66]">
            Halaman ini tidak tersedia di situs TREASURE 2026.
          </p>
          <a className="underline text-[#566B88]" href="/">Kembali ke beranda</a>
        </CardContent>
      </Card>
    </div>
  );
}
