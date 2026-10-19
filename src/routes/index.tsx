import { createFileRoute } from "@tanstack/react-router";
import { LocusApp } from "@/components/locus/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <LocusApp />;
}
