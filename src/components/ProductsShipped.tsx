const products = [
  {
    name: "Ray-Ban Meta",
    role: "Senior QA Engineer",
    company: "Meta",
  },
  {
    name: "Ray-Ban Stories",
    role: "QA Engineer",
    company: "Meta | Reality Labs",
  },
  {
    name: "Meta Quest",
    role: "QA Engineer",
    company: "Meta | Reality Labs",
  },
  {
    name: "Wave-1 XR",
    role: "QA Lead",
    company: "Emerge.io",
  },
  {
    name: "Autopilot",
    role: "QA Engineer",
    company: "Tesla",
  },
  {
    name: "Safe Browsing",
    role: "QA Analyst",
    company: "Google",
  },
];

export default function ProductsShipped() {
  return (
    <section className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full py-20">
      <h2 className="text-sm font-mono text-accent tracking-wide mb-10 uppercase">
        Products Shipped
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {products.map((product) => (
          <div
            key={product.name}
            className="border border-card-border rounded-lg p-5 bg-card text-center"
          >
            <p className="font-semibold text-sm mb-1">{product.name}</p>
            <p className="text-xs text-muted">{product.role}</p>
            <p className="text-xs text-muted/60 mt-0.5">{product.company}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
