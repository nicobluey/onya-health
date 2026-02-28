export default function healthHandler(req, res) {
  res.status(200).json({
    ok: true,
    service: "onya-health-backend",
    runtime: "vercel-function",
  });
}
