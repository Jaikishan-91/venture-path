"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { respondToOfferAction } from "./actions";

/** Accept / Decline with a confirm step, so a stray tap never answers an offer. */
export function OfferAnswer({
  applicationId,
  business,
}: {
  applicationId: string;
  business: string;
}) {
  const [answer, setAnswer] = useState<"accept" | "decline" | null>(null);

  if (answer === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setAnswer("accept")}>
          Accept
        </Button>
        <Button type="button" variant="outline" onClick={() => setAnswer("decline")}>
          Decline
        </Button>
      </div>
    );
  }
  return (
    <form action={respondToOfferAction} className="flex flex-col gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="answer" value={answer} />
      <p className="font-medium">
        {answer === "accept"
          ? `Accept ${business}'s offer? They'll get your email address.`
          : `Decline ${business}'s offer? This can't be undone.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={answer === "accept" ? "default" : "destructive"}>
          {answer === "accept" ? "Yes, accept" : "Yes, decline"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAnswer(null)}>
          Go back
        </Button>
      </div>
    </form>
  );
}
