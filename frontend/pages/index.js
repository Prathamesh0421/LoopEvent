import { useRouter } from "next/router";

import EventForm from "../components/EventForm";
import { submitPlan } from "../lib/api";

export default function Home() {
  const router = useRouter();

  async function handleSubmit(request) {
    const session = await submitPlan(request);
    await router.push(`/dashboard?session=${session.session_id}`);
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>LoopEvent</h1>
      <p>Autonomous event planning, with a human approval gate.</p>
      <EventForm onSubmit={handleSubmit} />
    </main>
  );
}

