import {Address, BigInt2, Block, StakeSetEvent, Transaction} from "./mocks";

export interface DuneEventTx {
    _address: string
    _subcourtID: number
    _stake: number
    _newTotalStake: number
    contract_address: string
    evt_tx_hash: string
    evt_index: number
    evt_block_time: string
    evt_block_number: number
}

export function StakeSetEventFromTxEvent(event: DuneEventTx): StakeSetEvent {
    const stakeSetEvent = new StakeSetEvent();
    stakeSetEvent.address = Address.fromString(event._address)
    stakeSetEvent.logIndex = BigInt2.fromI32(0)
    stakeSetEvent.transactionLogIndex = BigInt2.fromI32(0)
    stakeSetEvent.logType = null

    stakeSetEvent.params = {
        '_address': Address.fromString(event._address),
        '_subcourtID': BigInt2.fromI32(event._subcourtID),
        '_stake': BigInt2.fromI32(event._stake),
        '_newTotalStake': BigInt2.fromI32(event._newTotalStake),
    }

    stakeSetEvent.block = new Block(BigInt2.fromI32(/*event.evt_block_time*/ 0), BigInt2.fromI32(event.evt_block_number))

    stakeSetEvent.transaction = new Transaction(event.evt_tx_hash)

    return stakeSetEvent
}