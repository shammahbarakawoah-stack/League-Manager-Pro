import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Match, Team } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface StandingsTableProps {
  teams: Team[];
  matches: Match[];
}

export function computeStandings(teams: Team[], matches: Match[]) {
  const stats = teams.map(team => {
    let p = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
    matches.forEach(match => {
      if (match.status !== "approved") return;
      if (match.homeScore === undefined || match.awayScore === undefined) return;
      if (match.homeTeamId === team.id) {
        p++; gf += match.homeScore; ga += match.awayScore;
        if (match.homeScore > match.awayScore) w++;
        else if (match.homeScore === match.awayScore) d++;
        else l++;
      } else if (match.awayTeamId === team.id) {
        p++; gf += match.awayScore; ga += match.homeScore;
        if (match.awayScore > match.homeScore) w++;
        else if (match.awayScore === match.homeScore) d++;
        else l++;
      }
    });
    const gd = gf - ga;
    const pts = w * 3 + d;
    return { ...team, p, w, d, l, gf, ga, gd, pts };
  });

  stats.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });

  return stats;
}

const UCL_SPOTS = 6;

export function StandingsTable({ teams, matches }: StandingsTableProps) {
  const stats = computeStandings(teams, matches);

  if (teams.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground border rounded-lg bg-card/50">
        No teams registered yet.
      </div>
    );
  }

  const getZone = (pos: number, total: number) => {
    if (pos <= Math.min(UCL_SPOTS, total)) return "ucl";
    if (total > UCL_SPOTS + 3 && pos > total - 3) return "relegation";
    return "europa";
  };

  const zoneBorder: Record<string, string> = {
    ucl: "border-l-4 border-l-primary",
    europa: "border-l-4 border-l-orange-500",
    relegation: "border-l-4 border-l-destructive",
    none: "border-l-4 border-l-transparent",
  };

  const showZones = teams.length >= 2;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/50 bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-10 text-center">Pos</TableHead>
              <TableHead>Club</TableHead>
              <TableHead className="text-center">P</TableHead>
              <TableHead className="text-center">W</TableHead>
              <TableHead className="text-center">D</TableHead>
              <TableHead className="text-center">L</TableHead>
              <TableHead className="text-center hidden sm:table-cell">GF</TableHead>
              <TableHead className="text-center hidden sm:table-cell">GA</TableHead>
              <TableHead className="text-center">GD</TableHead>
              <TableHead className="text-center font-bold text-primary">Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((team, index) => {
              const pos = index + 1;
              const zone = showZones ? getZone(pos, stats.length) : "none";
              return (
                <TableRow key={team.id} className={`${zoneBorder[zone]} transition-colors hover:bg-accent/50`}>
                  <TableCell className="text-center font-medium">{pos}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 border border-border flex-shrink-0">
                        <AvatarImage src={team.logoURL ?? undefined} />
                        <AvatarFallback className="text-[10px]">{(team.name ?? "??").substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-semibold truncate">{team.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">{team.p}</TableCell>
                  <TableCell className="text-center">{team.w}</TableCell>
                  <TableCell className="text-center">{team.d}</TableCell>
                  <TableCell className="text-center">{team.l}</TableCell>
                  <TableCell className="text-center hidden sm:table-cell text-muted-foreground">{team.gf}</TableCell>
                  <TableCell className="text-center hidden sm:table-cell text-muted-foreground">{team.ga}</TableCell>
                  <TableCell className="text-center font-mono">{team.gd > 0 ? `+${team.gd}` : team.gd}</TableCell>
                  <TableCell className="text-center font-bold text-primary">{team.pts}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {showZones && (
        <div className="flex flex-wrap gap-4 px-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary" />
            <span>Champions League (Top {Math.min(UCL_SPOTS, teams.length)})</span>
          </div>
          {teams.length > UCL_SPOTS && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-orange-500" />
              <span>Europa League</span>
            </div>
          )}
          {teams.length > UCL_SPOTS + 3 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-destructive" />
              <span>Relegation</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
