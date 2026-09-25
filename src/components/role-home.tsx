import { SignOutButton } from "@/components/sign-out-button";

export function RoleHome({
  title,
  name,
  children,
}: {
  title: string;
  name: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">Signed in as {name}</p>
        </div>
        <SignOutButton />
      </header>
      {children}
    </main>
  );
}
