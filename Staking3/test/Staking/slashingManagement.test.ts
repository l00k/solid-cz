import { SlashingParamsChangedEvent } from '@/Staking';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { assertErrorMessage, assertIsAvailableOnlyForOwner, findEvent, tokenFormat } from '../helpers/utils';
import { TestContext } from './TestContext';


const day = 24 * 3600;
const month = 30 * day;


describe('Slashing management', async() => {
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
                .changeSlashingParams(
                    1000,
                    10 ** 4
                );
        });
    });
    
    it('Should properly change early withdrawals params', async() => {
        const tx = await testContext.stakingContract
            .connect(owner)
            .changeSlashingParams(
                1000,
                10 ** 4
            );
        const result = await tx.wait();
        expect(result.status).to.be.equal(1);
        
        // check event
        const event = findEvent<SlashingParamsChangedEvent>(result, 'SlashingParamsChanged');
        expect(event.args.minimalStakeTime).to.be.equal(1000);
        expect(event.args.slashRatePermill).to.be.equal(10 ** 4);
        
        // check state
        const minimalStakeTime = await testContext.stakingContract.minimalStakeTime();
        expect(minimalStakeTime).to.be.equal(1000);
        
        const slashRatePermill = await testContext.stakingContract.slashRatePermill();
        expect(slashRatePermill).to.be.equal(10 ** 4);
    });
});
