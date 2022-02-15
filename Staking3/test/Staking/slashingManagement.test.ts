import { EarlyWithdrawalParamsChangedEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, assertIsAvailableOnlyForOwner, findEvent, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';


const day = 24 * 3600;
const month = 30 * day;


xdescribe('Slashing management', async() => {
    let owner : SignerWithAddress;
    let testContext : TestContext;
    
    
    
    beforeEach(async() => {
        testContext = new TestContext();
        
        await testContext.initAccounts();
        await testContext.initStakingContract();
        
        await testContext.initRewardTokens();
        
        [ owner ] = await ethers.getSigners();
    });
    
    
    it('Allows to change early withdrawals params only by owner', async() => {
        await assertIsAvailableOnlyForOwner(async(account) => {
            return testContext.stakingContract
                .connect(account)
                .changeEarlyWithdrawalParams(
                    1000,
                    10 ** 4
                );
        });
    });
    
    it('Should properly change early withdrawals params', async() => {
        const tx = await testContext.stakingContract
            .connect(owner)
            .changeEarlyWithdrawalParams(
                1000,
                10 ** 4
            );
        const result = await tx.wait();
        expect(result.status).to.be.equal(1);
        
        // check event
        const event = findEvent<EarlyWithdrawalParamsChangedEvent>(result, 'EarlyWithdrawalParamsChanged');
        expect(event.args.minStakeTime).to.be.equal(1000);
        expect(event.args.earlyWithdrawalSlashRatePermill).to.be.equal(10 ** 4);
        
        // check state
        const minStakeTime = await testContext.stakingContract.minStakeTime();
        expect(minStakeTime).to.be.equal(1000);
        
        const earlyWithdrawalSlashRatePermill = await testContext.stakingContract.earlyWithdrawalSlashRatePermill();
        expect(earlyWithdrawalSlashRatePermill).to.be.equal(10 ** 4);
    });
});
