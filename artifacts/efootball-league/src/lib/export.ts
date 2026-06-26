import { computeStandings } from "@/components/StandingsTable";
import { Team, Match } from "@/lib/types";

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportStandingsCSV(leagueName: string, teams: Team[], matches: Match[]) {
  const rows = computeStandings(teams, matches);
  const header = ["Pos", "Club", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"];
  const lines = rows.map((r, i) => [i + 1, `"${r.name ?? ""}"`, r.p, r.w, r.d, r.l, r.gf, r.ga, r.gd, r.pts].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  downloadFile(csv, `${leagueName}-standings.csv`, "text/csv");
}

export function exportFixturesCSV(
  leagueName: string,
  matches: Array<{ homeTeamName: string; awayTeamName: string; scheduledDate: number; matchday?: number; status: string; homeScore?: number; awayScore?: number }>
) {
  const header = ["Matchday", "Home", "Away", "Date", "Status", "Score"];
  const lines = matches.map(m => [
    m.matchday ?? "",
    `"${m.homeTeamName}"`,
    `"${m.awayTeamName}"`,
    new Date(m.scheduledDate).toLocaleDateString(),
    m.status,
    m.status === "approved" ? `${m.homeScore}-${m.awayScore}` : "",
  ].join(","));
  const csv = [header.join(","), ...lines].join("\n");
  downloadFile(csv, `${leagueName}-fixtures.csv`, "text/csv");
}

export function printStandings(leagueName: string, teams: Team[], matches: Match[]) {
  const rows = computeStandings(teams, matches);
  const tableRows = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td><td>${r.name ?? ""}</td><td>${r.p}</td><td>${r.w}</td>
      <td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td>
      <td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td><strong>${r.pts}</strong></td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html><head><title>${leagueName} Standings</title>
  <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:8px;text-align:center}th{background:#1a1a2e;color:#00ff88}
  td:nth-child(2){text-align:left}h1{color:#1a1a2e}@media print{button{display:none}}</style></head>
  <body><h1>${leagueName} — League Table</h1>
  <table><thead><tr><th>Pos</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
  <tbody>${tableRows}</tbody></table>
  <script>window.onload=()=>window.print()<\/script></body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}
