/* eslint-disable prefer-const */
import {
  Address,
  BigInt,
  log,
} from "@graphprotocol/graph-ts";
import { ExecuteTransactionListCall } from "../generated/KlerosGovernor/KlerosGovernor";
import { KlerosLiquid } from "../generated/KlerosLiquid/KlerosLiquid";
import { getOrInitializeKlerosCounter, getOrCreateCourt } from "./KlerosLiquidMappings"



export function handlerExecuteTransactionList(call: ExecuteTransactionListCall): void {
  // Awful patch, but in every execute transaction of the governor, i will check the court
  // parameters to have the last value.
  // for some reason, the graph is not tracking the internal txs of the governor changing
  // parameters of the klerosliquid.
  //
  // WARNING!. THIS SHOULD NOT BE DEPLOYED IN XDAI!. WILL FAIL BECAUSE THERE IS NO GOVERNOR!.
  // log.warning("Governor: Checking court parameters because the governor was called at block {}!", [call.block.number.toString()])
  let kc = getOrInitializeKlerosCounter();
  const KL = Address.fromBytes(Address.fromHexString("0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069"));
  
  let kl = KlerosLiquid.bind(KL);

  for (let subcourtID = 0; subcourtID < kc.courtsCount.toI32(); subcourtID++) {
    log.debug("Governor: Updating court {}", [subcourtID.toString()])
    let courtID = BigInt.fromI32(subcourtID)
    let court = getOrCreateCourt(courtID, KL);
    if (court === null) return
    let courtObj = kl.try_courts(courtID)
    if (!courtObj.reverted) {
      court.hiddenVotes = courtObj.value.value1
      court.minStake = courtObj.value.value2
      court.alpha = courtObj.value.value3
      court.feeForJuror = courtObj.value.value4
      court.jurorsForCourtJump = courtObj.value.value5
      // get timePeriods
      let subcourtObj = kl.getSubcourt(courtID)
      court.timePeriods = subcourtObj.value1
      court.save()
    }
    
  }
}
