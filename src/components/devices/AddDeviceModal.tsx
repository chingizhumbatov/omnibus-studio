import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useUIStore } from "@/store/uiStore";
import { ChannelNode, DeviceNode, DeviceConfig } from "@/core/contracts/devices";

interface AddDeviceModalProps {
  channel: ChannelNode;
  devicesCount: number;
}

export function AddDeviceModal({ channel, devicesCount }: AddDeviceModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { addDevice } = useUIStore();

  const handleAddDevice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    
    let config: DeviceConfig = {};
    if (channel.protocol === "modbus") {
      config = { slaveId: Number(formData.get("slaveId")), tags: [] };
    } else if (channel.protocol === "mqtt") {
      config = { baseTopic: formData.get("baseTopic") as string };
    }

    const newDev: DeviceNode = {
      id: `dev_${Date.now()}`,
      channelId: channel.id,
      name: name || "New Device",
      enabled: true,
      config,
      profileId: "template_unknown",
      status: "offline"
    };

    addDevice(newDev);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button 
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-secondary rounded transition-opacity"
          title="Add Device"
          onClick={(e) => e.stopPropagation()}
        >
          <Plus className="w-3 h-3 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Add Device to {channel.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddDevice} className="space-y-4 py-4">
          <div className="flex flex-col space-y-2">
            <label className="text-sm font-medium">Device Name</label>
            <input 
              name="name"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" 
              defaultValue={`Device ${devicesCount + 1}`} 
            />
          </div>

          <div className="flex flex-col space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Protocol</label>
            <input 
              className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm text-muted-foreground cursor-not-allowed uppercase" 
              value={channel.protocol} 
              disabled 
            />
          </div>

          {channel.protocol === "modbus" && (
            <div className="flex flex-col space-y-2">
              <label className="text-sm font-medium">Slave ID (1-247)</label>
              <input 
                name="slaveId"
                type="number" 
                min="1" max="247" 
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" 
                defaultValue={devicesCount + 1} 
                required
              />
            </div>
          )}

          {channel.protocol === "mqtt" && (
            <div className="flex flex-col space-y-2">
              <label className="text-sm font-medium">Base Topic</label>
              <input 
                name="baseTopic"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" 
                placeholder="e.g. factory/line1/plc" 
                required
              />
            </div>
          )}

          <DialogFooter>
            <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 mt-4">
              Add Device
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
