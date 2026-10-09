"use client";
import { ComponentProps, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function PasswordInput(props: ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return <div className="password-field">
    <Input {...props} type={visible ? "text" : "password"} className={`password-input ${props.className || ""}`} />
    <Button type="button" variant="ghost" className="password-toggle" aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} aria-pressed={visible} aria-controls={props.id} onClick={() => setVisible(!visible)}>
      {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </Button>
  </div>;
}
