const products = [
  { name: "Ray-Ban Meta", role: "Senior QA Engineer", company: "Meta" },
  { name: "Ray-Ban Stories", role: "QA Engineer", company: "Meta | Reality Labs" },
  { name: "Meta Quest", role: "QA Engineer", company: "Meta | Reality Labs" },
  { name: "Wave-1 XR", role: "QA Lead", company: "Emerge.io" },
  { name: "Autopilot", role: "QA Engineer", company: "Tesla" },
  { name: "Safe Browsing", role: "QA Analyst", company: "Google" },
];

export default function ProductsShipped() {
  return (
    <section className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full py-16 border-t border-card-border">
      <h2 className="text-sm font-mono text-accent tracking-wide mb-8 uppercase">
        Products Shipped
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {products.map((product) => (
          <div
            key={product.name}
            className="border border-card-border rounded-lg p-4 bg-card text-center hover:border-accent/30 transition-colors"
          >
            <p className="font-semibold text-sm mb-1">{product.name}</p>
            <p className="text-[11px] text-muted leading-tight">{product.role}</p>
            <p className="text-[11px] text-muted/50 leading-tight">{product.company}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
