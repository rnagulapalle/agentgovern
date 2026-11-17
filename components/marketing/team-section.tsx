import copy from "@/lib/marketing-team-copy.json";
import marks from "@/lib/team-brand-icons.json";

export function TeamSection() {
  return <section className="clarity-team" aria-labelledby="team-title">
    <div className="clarity-team-copy"><h2 id="team-title">{copy.title}</h2><p>{copy.body}</p></div>
    <div className="clarity-team-experience" aria-label="Prior team experience">
      <div className="clarity-team-brand meta"><svg viewBox="0 0 24 24" aria-hidden="true">{marks.meta.map(d=><path key={d} d={d}/>)}</svg><span>Meta Ads</span></div>
      <div className="clarity-team-brand whatsapp"><svg viewBox="0 0 24 24" aria-hidden="true">{marks.whatsapp.map(d=><path key={d} d={d}/>)}</svg><span>WhatsApp Business</span></div>
    </div>
  </section>;
}
