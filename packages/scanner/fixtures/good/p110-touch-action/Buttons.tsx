export function Toolbar() {
  return (
    <div>
      <button style={{ touchAction: 'manipulation' }} onClick={save}>Save</button>
      <button style={{ touchAction: 'manipulation' }} onClick={undo}>Undo</button>
    </div>
  );
}
