const guide = 'https://github.com/perminder-klair/subwave/discussions/1817';
const guideSuffix = `\n\nHow to give your DJ Musical Leanings: ${guide}`;

export function ShowGenerationNotice({ message }: { message: string }) {
  const hasGuide = message.endsWith(guideSuffix);
  return <div className="space-y-2 text-[12px] text-muted">
    <p className="whitespace-pre-line">{hasGuide ? message.slice(0, -guideSuffix.length) : message}</p>
    {hasGuide && <a href={guide} target="_blank" rel="noopener noreferrer" className="inline-block underline hover:text-ink">
      How to give your DJ Musical Leanings ↗
    </a>}
  </div>;
}
