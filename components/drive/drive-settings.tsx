"use client";
import { useState } from "react";
import { Cloud, FolderPlus, Loader2, Link2, Unplug } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useDrive } from "./drive-provider";

export function DriveSettings() {
  const drive = useDrive(); const [name, setName] = useState("Mira conversations");
  return <section className="connection-section drive-settings" aria-label="Google Drive settings">
    <h3><Cloud size={18}/>Your Google Drive</h3>
    <p>Save transcripts in your own Drive space. Connect the Google account for <strong>{drive.email}</strong>. Your Mira login stays separate.</p>
    <p className="drive-status" role="status">{drive.connected ? drive.folder ? `Connected · ${drive.folder.name}` : "Connected · create a folder to start saving" : drive.folder ? "Reconnect to access your saved conversations" : "Not connected · conversations are not saved"}</p>
    {drive.error && <p className="drive-error" role="alert">{drive.error}</p>}
    {drive.notice && <p className="key-notice" role="status">{drive.notice}</p>}
    {!drive.connected ? <><button className="start-button" onMouseEnter={drive.prepare} onFocus={drive.prepare} disabled={drive.busy} onClick={()=>void drive.connect()}>{drive.busy ? <Loader2 className="auth-spinner" size={17}/> : <Link2 size={17}/>} {drive.folder ? "Reconnect Google Drive" : "Connect Google Drive"}</button>{drive.folder&&<button className="text-button" disabled={drive.busy} onClick={()=>void drive.disconnect()}><Unplug size={16}/>Disconnect Google Drive</button>}</> : <>
      {drive.folders.length > 0 && <label className="drive-folder-label">Conversation folder<select aria-label="Google Drive conversation folder" value={drive.folder?.id || ""} disabled={drive.busy} onChange={event=>void drive.selectFolder(event.target.value)}><option value="" disabled>Select your Mira folder</option>{drive.folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}
      <form className="drive-folder-form" onSubmit={async event=>{event.preventDefault(); await drive.createFolder(name);}}><label htmlFor="drive-folder-name">Create a private folder</label><div><input id="drive-folder-name" value={name} onChange={event=>setName(event.target.value)} maxLength={100} required disabled={drive.busy} autoComplete="off"/><button className="text-button" type="submit" disabled={drive.busy || !name.trim()}><FolderPlus size={17}/>{drive.busy ? "Please wait…" : "Create folder"}</button></div></form>
      <label className="setting-row"><span><strong>Save when the call ends</strong><small>Upload starts as soon as you end a conversation.</small></span><Switch aria-label="Automatically save completed conversations to Google Drive" checked={drive.autoSave} onCheckedChange={drive.setAutoSave} disabled={drive.busy || !drive.folder}/></label>
      <button className="text-button" disabled={drive.busy} onClick={()=>void drive.disconnect()}><Unplug size={16}/>Disconnect Google Drive</button>
    </>}
    <p className="settings-footnote">Mira requests only access to files it creates. Files stay private; no public links are created. Without Drive, new conversations stay on this screen only. Access expires periodically; reconnect to continue saving.</p>
    <a className="text-button" href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Manage Google account connections</a>
  </section>;
}
