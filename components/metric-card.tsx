import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  icon: React.ReactNode;
  iconClassName?: string;
}

export function MetricCard({ title, value, trend, trendUp, icon, iconClassName }: MetricCardProps) {
  return (
    <Card className="rounded-xl border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className={cn("p-2 rounded-md", iconClassName)}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-semibold mt-4 mb-2">{value}</div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {trend && (
          <div className="flex items-center mt-1 space-x-1 text-xs text-muted-foreground">
            {trendUp !== undefined && (
              trendUp ? 
                <TrendingUp className="h-3 w-3 text-emerald-500" /> : 
                <TrendingDown className="h-3 w-3 text-rose-500" />
            )}
            <span>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
