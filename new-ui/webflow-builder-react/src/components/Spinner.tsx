export function Spinner({
  size = 16,
  thickness = 2,
  color = '#146ef5',
}: {
  size?: number;
  thickness?: number;
  color?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="wb-spin inline-block rounded-full"
      style={{
        width: size,
        height: size,
        border: `${thickness}px solid rgba(255,255,255,0.1)`,
        borderTopColor: color,
      }}
    />
  );
}
