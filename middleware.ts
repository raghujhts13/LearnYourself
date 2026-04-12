import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * When NEXT_PUBLIC_LYS_STUDENT_SITE=1 (Vercel standalone classroom deployment),
 * only the learner surface and required APIs are reachable — no editor, no teacher APIs.
 */
export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_LYS_STUDENT_SITE !== '1') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next')) return NextResponse.next();

  const staticExt =
    /\.(ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|eot|json|txt|mp3|wav|mp4|webm)$/i;
  if (staticExt.test(pathname)) return NextResponse.next();

  if (pathname.startsWith('/learn')) return NextResponse.next();

  if (pathname.startsWith('/api/classroom-media')) return NextResponse.next();

  if (pathname === '/api/slide-qa') return NextResponse.next();

  if (pathname === '/api/classroom' && request.method === 'GET') return NextResponse.next();

  if (pathname === '/') {
    const id = process.env.NEXT_PUBLIC_STUDENT_CLASSROOM_ID;
    if (id) {
      return NextResponse.redirect(new URL(`/learn/${id}`, request.url));
    }
  }

  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
