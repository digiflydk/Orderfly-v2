import type { ReactNode } from "react"
import CmsHeader from "@/components/cms/CmsHeader"
import Sidebar from "@/components/cms/Sidebar"

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-background">
      <CmsHeader />
      <div className="mx-auto flex w-full max-w-screen-2xl">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
