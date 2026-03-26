export default function DeniedPage() {
  return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-text mb-3">Access Denied</h1>
        <p className="text-muted text-sm">Your IP is not on the allowlist. Request access via Discord.</p>
      </div>
    </div>
  );
}
