import { cn } from "@/lib/utils";

export const headingLevel = {
  1: "scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance",
  2: "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
  3: "scroll-m-20 text-2xl font-semibold tracking-tight",
  4: "scroll-m-20 text-xl font-semibold tracking-tight",
};

export const Heading = ({
  children,
  level = 1,
  className,
}: {
  children: React.ReactNode;
  level?: 1 | 2 | 3 | 4;
  className?: string;
}) => {
  const levelClass = headingLevel[level];
  return <h1 className={cn(levelClass, className)}>{children}</h1>;
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
