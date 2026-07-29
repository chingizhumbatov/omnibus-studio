import logging
from pymodbus.server import StartTcpServer
from pymodbus.device import ModbusDeviceIdentification
from pymodbus.datastore import ModbusSequentialDataBlock, ModbusSlaveContext, ModbusServerContext
from pymodbus.transaction import ModbusSocketFramer

# Configure logging to see what is being requested
logging.basicConfig()
log = logging.getLogger()
log.setLevel(logging.INFO)

def run_server():
    # Setup data store for the simulator
    # We initialize coils, discretes, inputs, and holdings with some dummy data
    # ModbusSequentialDataBlock(start_address, list_of_values)
    store = ModbusSlaveContext(
        di=ModbusSequentialDataBlock(0, [1]*100),       # Discrete Inputs
        co=ModbusSequentialDataBlock(0, [0]*100),       # Coils
        hr=ModbusSequentialDataBlock(0, [i for i in range(100)]), # Holding Registers
        ir=ModbusSequentialDataBlock(0, [i*10 for i in range(100)]) # Input Registers
    )
    
    # Context maps slave ID to the store. 
    # single=True means all requests regardless of slave ID go to this store.
    context = ModbusServerContext(slaves=store, single=True)
    
    # Setup device identification
    identity = ModbusDeviceIdentification()
    identity.VendorName = 'OmnibusStudio'
    identity.ProductCode = 'OMN-SIM'
    identity.VendorUrl = 'http://github.com/omnibus'
    identity.ProductName = 'Modbus TCP Simulator'
    identity.ModelName = 'Simulator'
    identity.MajorMinorRevision = '1.0.0'
    
    print("Starting Modbus TCP Simulator on localhost:5020...")
    print("Registers 0-99 (Holding) are initialized with values 0-99.")
    
    # Start the server on port 5020 (to avoid needing root privileges for port 502)
    StartTcpServer(
        context=context, 
        identity=identity, 
        address=("0.0.0.0", 5020),
        framer=ModbusSocketFramer
    )

if __name__ == "__main__":
    run_server()
