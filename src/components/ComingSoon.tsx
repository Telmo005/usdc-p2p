export function ComingSoon({ title, description, planned }: { title: string; description: string; planned: string[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-muted">
          Este módulo ainda não foi construído nesta fase — fica no roteiro seguinte, listado honestamente aqui em vez de uma tela vazia
          sem explicação.
        </p>
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {planned.map((item) => (
            <li key={item} className="flex items-center gap-2 text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
