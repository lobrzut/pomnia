import clsx from 'clsx'
import appIcon from '@brand/icon.png'

const SIZES = {
  xs: 'h-7 w-7',
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
  xl: 'h-20 w-20'
} as const

export type AppLogoSize = keyof typeof SIZES

type AppLogoProps = {
  size?: AppLogoSize
  className?: string
  /** Subtle iris ring — use on hero / gate, not tiny title-bar marks. */
  glow?: boolean
}

/** Circular Pomnia brand mark — clips square PNG corners, no gradient wrapper. */
export function AppLogo({ size = 'sm', className, glow }: AppLogoProps) {
  return (
    <div
      className={clsx(
        // Soft radial mask kills any residual square-edge fringe beyond the stone rim
        'relative shrink-0 overflow-hidden rounded-full [mask-image:radial-gradient(circle,black_88%,transparent_100%)] [-webkit-mask-image:radial-gradient(circle,black_88%,transparent_100%)]',
        SIZES[size],
        glow && 'ring-glow',
        className
      )}
    >
      <img
        src={appIcon}
        alt=""
        aria-hidden
        className="h-full w-full rounded-full object-cover"
        draggable={false}
      />
    </div>
  )
}
