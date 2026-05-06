export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/PVGIS_6.0_HydroGuide_Beta.txt") {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
