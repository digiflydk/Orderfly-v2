'use client'

import Image from 'next/image'

export default function Logo({
  src = 'https://i.postimg.cc/HxTMqLGV/Orderfly-Logo-white-F.png',
  width = 140,
  height = 40,
  priority = true,
  alt = 'OrderFly Logo',
}: {
  src?: string
  width?: number
  height?: number
  priority?: boolean
  alt?: string
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      style={{ width: 'auto', height: 'auto' }}
      className="object-contain"
    />
  )
}
