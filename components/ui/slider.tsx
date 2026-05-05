import * as React from "react"

import { cn } from "@/lib/utils"

interface SliderProps {
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  onValueChange?: (value: number) => void
}

function Slider({
  className,
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  onValueChange,
}: SliderProps) {
  const pct = ((( value ?? defaultValue ?? min) - min) / (max - min)) * 100

  return (
    <div
      data-slot="slider"
      className={cn("relative flex w-full touch-none items-center select-none", disabled && "opacity-50 pointer-events-none", className)}
    >
      <div
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted"
      >
        <div
          data-slot="slider-range"
          className="absolute h-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <input
        type="range"
        data-slot="slider-thumb"
        min={min}
        max={max}
        step={step}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={(e) => onValueChange?.(e.target.valueAsNumber)}
        className="absolute w-full cursor-pointer opacity-0 h-4"
      />
      <div
        className="absolute size-3 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] pointer-events-none"
        style={{ left: `calc(${pct}% - 6px)` }}
      />
    </div>
  )
}

export { Slider }
