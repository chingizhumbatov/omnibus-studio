import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useUIStore } from '@/store/uiStore';
import {
  ChannelNode,
  ProtocolType,
  TransportType,
  SerialTransportConfig,
  TcpTransportConfig,
} from '@/core/contracts/devices';

export function AddChannelModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [protocol, setProtocol] = useState<ProtocolType>('modbus');
  const [transport, setTransport] = useState<TransportType>('serial');

  const { channels, addChannel } = useUIStore();

  const handleAddChannel = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;

    let transportConfig: SerialTransportConfig | TcpTransportConfig | undefined;

    if (transport === 'serial') {
      transportConfig = {
        baudRate: Number(formData.get('baudRate')),
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      };
    } else if (transport === 'tcp') {
      transportConfig = {
        ipAddress: formData.get('ipAddress') as string,
        tcpPort: Number(formData.get('tcpPort')),
      };
    }

    const newChannel: ChannelNode = {
      id: `chan_${Date.now()}`,
      name: name || 'New Channel',
      protocol,
      transport,
      transportConfig,
      status: 'offline',
    };

    addChannel(newChannel);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          className="p-1 hover:bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors"
          title="Add Channel"
        >
          <Plus className="w-3 h-3" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Logical Channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddChannel} className="space-y-4 py-1.5">
          <div className="flex flex-col space-y-2">
            <label className="text-[10px] font-medium">Channel Name</label>
            <input
              name="name"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[10px] shadow-sm"
              defaultValue={`Channel ${channels.length + 1}`}
            />
          </div>

          <div className="flex flex-col space-y-2">
            <label className="text-[10px] font-medium">Protocol</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[10px] shadow-sm"
              value={protocol}
              onChange={(e) => {
                const newProto = e.target.value as ProtocolType;
                setProtocol(newProto);
                // MQTT/OPC UA typically run over TCP
                if (newProto === 'mqtt' || newProto === 'opcua') {
                  setTransport('tcp');
                }
              }}
            >
              <option value="modbus">Modbus</option>
              <option value="mqtt">MQTT</option>
              <option value="opcua">OPC UA</option>
            </select>
          </div>

          <div className="flex flex-col space-y-2">
            <label className="text-[10px] font-medium">Transport</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[10px] shadow-sm"
              value={transport}
              onChange={(e) => setTransport(e.target.value as TransportType)}
            >
              <option value="serial">Serial (COM Port)</option>
              <option value="tcp">TCP/IP</option>
              <option value="mock">Mock Simulator</option>
            </select>
          </div>

          {transport === 'serial' && (
            <div className="flex flex-col space-y-2">
              <label className="text-[10px] font-medium">Baud Rate</label>
              <select
                name="baudRate"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[10px] shadow-sm"
                defaultValue="9600"
              >
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="38400">38400</option>
                <option value="115200">115200</option>
              </select>
            </div>
          )}

          {transport === 'tcp' && (
            <div className="flex space-x-2">
              <div className="flex flex-col space-y-2 flex-1">
                <label className="text-[10px] font-medium">IP Address</label>
                <input
                  name="ipAddress"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[10px] shadow-sm"
                  defaultValue="127.0.0.1"
                />
              </div>
              <div className="flex flex-col space-y-2 w-24">
                <label className="text-[10px] font-medium">Port</label>
                <input
                  name="tcpPort"
                  type="number"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[10px] shadow-sm"
                  defaultValue={protocol === 'mqtt' ? 1883 : 502}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <button
              type="submit"
              className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-[10px] font-medium hover:bg-primary/90 mt-4"
            >
              Add Channel
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
