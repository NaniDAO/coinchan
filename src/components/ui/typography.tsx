import { cn } from "@/lib/utils";

export const Heading = ({
  children,
  level = 1,
  className,
}: {
  children: React.ReactNode;
  level?: 1 | 2 | 3 | 4;
  className?: string;
}) => {
  switch (level) {
    case 1:
      return (
        <h1
          className={cn(
            "scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance",
            className,
          )}
        >
          {children}
        </h1>
      );
    case 2:
      return (
        <h2
          className={cn(
            "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
            className,
          )}
        >
          {children}
        </h2>
      );
    case 3:
      return (
        <h3
          className={cn(
            "scroll-m-20 text-2xl font-semibold tracking-tight",
            className,
          )}
        >
          {children}
        </h3>
      );
    case 4:
      return (
        <h4
          className={cn(
            "scroll-m-20 text-xl font-semibold tracking-tight",
            className,
          )}
        >
          {children}
        </h4>
      );
  }
};

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="leading-7 [&:not(:first-child)]:mt-6">{children}</p>;
}

export function Blockquote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="mt-6 border-l-2 pl-6 italic">{children}</blockquote>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
      {children}
    </code>
  );
}

export function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-xl">{children}</p>;
}
