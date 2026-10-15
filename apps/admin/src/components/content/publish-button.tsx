import { SendIcon } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/** Publishing is live for the App within a minute, so it always asks first. */
export function PublishButton({ what, nextVersion }: { what: string; nextVersion: number }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" />}>
        <SendIcon /> 发布
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            发布 {what} v{nextVersion}？
          </AlertDialogTitle>
          <AlertDialogDescription>
            App 一分钟内用上新版本，会在 #project-psygym 发通知。旧版本保留，可以随时恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => toast("发布：等接口合同。")}>发布</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
