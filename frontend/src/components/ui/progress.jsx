import * as React from "react"
import { cn } from "@/lib/utils"

const Progress = React.forwardRef(
  ({ className, value, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative w-full overflow-hidden rounded-full bg-secondary h-2", className)}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ width: `${value || 0}%` }}
      />
    </div>
  )
)
Progress.displayName = "Progress"

export { Progress }
