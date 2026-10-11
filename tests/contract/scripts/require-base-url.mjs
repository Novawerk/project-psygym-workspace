// Stops the run before any request goes out when BASE_URL isn't set. There is no default on
// purpose: port 8787 on our machines is often someone else's dev server.
if (!process.env.BASE_URL?.trim()) {
  console.error(
    "请设置 BASE_URL，例如 BASE_URL=http://localhost:8790（本机 8787 常被别的项目占着，我们不设默认值）。\n" +
      "Set BASE_URL, e.g. BASE_URL=http://localhost:8790. There is no default: port 8787 is often another project's server.",
  );
  process.exit(1);
}
