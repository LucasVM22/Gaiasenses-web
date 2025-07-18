import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";

export default async function middleware(request: NextRequest){
  // Step 1: Use the incoming request (example)
  const defaultLocale = request.headers.get('x-your-custom-locale') || 'en';
 
  const handleI18nRouting = createMiddleware({
    locales: ["pt", "en"],
    defaultLocale:"pt"
  });
  const {geo} = request;
  //console.log("middleware")

  if(request.nextUrl.searchParams.get("lat") === null){
    request.nextUrl.searchParams.set("lat",geo?.latitude || "-23.5528381")
  }
  if(request.nextUrl.searchParams.get("lng") === null){
    request.nextUrl.searchParams.set("lng",geo?.longitude || "-46.6621533")
  }

  if(request.nextUrl.searchParams.get("mode") === null){
    request.nextUrl.searchParams.set("mode", "map")
  }

  //console.log(JSON.stringify(request.nextUrl))
  const userLat = geo?.latitude || -23.5528381;
  const userLng = geo?.longitude || -46.6621533;
  
  const response = handleI18nRouting(request);
  //Step 2: Set cookies based on the request
   if (!request.cookies.get("userLocation")) {
    response.cookies.set(
      "userLocation", JSON.stringify({ lat: userLat, lng: userLng }),
      { path: "/", maxAge: 60 * 60 * 24 * 7 } 
    );
  }
  response.headers.set("x-your-custom-locale", defaultLocale);
  
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/",
    "/(pt|en)/:path*",
    //"/((?!api|_next/static|_next/image|favicon.ico).*)",

    // Enable redirects that add missing locales
    // (e.g. `/pathnames` -> `/en/pathnames`)
    "/((?!_next|_vercel|.*\\..*).*)",
  ],
};
