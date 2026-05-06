const API_DOCS_URL = "/api/docs?ui";

export default function ApiPage() {
  return (
    <main className="h-[calc(100vh-5rem)] min-h-[42rem] bg-white md:h-[calc(100vh-3rem)]">
      <iframe
        title="HydroGuide API"
        src={API_DOCS_URL}
        className="h-full w-full border-0"
        loading="lazy"
      />
    </main>
  );
}
