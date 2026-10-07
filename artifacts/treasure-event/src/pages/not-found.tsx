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
              Page not found
            </h1>
          </div>

          <p className="mt-4 text-sm text-[#625D66]">
            This page is not available on the TREASURE 2026 website.
          </p>
          <a className="underline text-[#566B88]" href="/">Back to home</a>
        </CardContent>
      </Card>
    </div>
  );
}
