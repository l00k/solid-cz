import { CoinMarket, CoinsBoughtEvent, MarketPriceChangedEvent } from '@/CoinMarket';
import { CoinsMintedEvent } from '@/Mintable';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Factory } from './fixtures/contracts';
import { assertErrorMessage, findEvent } from './helpers/utils';


const contractsToTest = [
    'SampleCoin'
];

contractsToTest.forEach(contractName => {
    
    describe(`${contractName} is CoinMarket`, () => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : CoinMarket;
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            contract = <any>await Factory[contractName]();
        });
        
        it('Should initiate with proper values', async() => {
            const initialPrice = await contract.price();
            expect(initialPrice).to.be.equal(ethers.utils.parseEther('0.01'));
            
            const payoutTarget = await contract.payoutTarget();
            expect(payoutTarget).to.be.equal(owner.address);
        });
        
        it('Allow changing payout target only to owners', async() => {
            {
                const tx = contract.connect(alice)
                    .changePayoutTarget(bob.address);
                await assertErrorMessage(tx, 'OnlyOwnerAllowed()');
            }
            {
                const tx = await contract.connect(owner)
                    .changePayoutTarget(bob.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Properly changes payout target', async() => {
            const tx = await contract.connect(owner)
                .changePayoutTarget(bob.address);
            const result = await tx.wait();
            expect(result.status).to.be.equal(1);
            
            const payoutTarget = await contract.payoutTarget();
            expect(payoutTarget).to.be.equal(bob.address);
        });
        
        it('Allow changing price only to owners', async() => {
            {
                const tx = contract.connect(alice)
                    .changePrice(ethers.utils.parseEther('0.1'));
                await assertErrorMessage(tx, 'OnlyOwnerAllowed()');
            }
            {
                const tx = await contract.connect(owner)
                    .changePrice(ethers.utils.parseEther('0.1'));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Properly changes price', async() => {
            {
                const tx = await contract.connect(owner)
                    .changePrice(ethers.utils.parseEther('0.1'));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
        
                const price = await contract.price();
                expect(price).to.be.equal(ethers.utils.parseEther('0.1'));
        
                const event = findEvent<MarketPriceChangedEvent>(result, 'MarketPriceChanged');
                expect(event.args.by).to.be.equal(owner.address);
                expect(event.args.price).to.be.equal(ethers.utils.parseEther('0.1'));
            }
            
            // again (no event)
            {
                const tx = await contract.connect(owner)
                    .changePrice(ethers.utils.parseEther('0.1'));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                expect(result.events?.length).to.be.equal(0);
            }
            
            {
                const tx = contract.connect(owner)
                    .changePrice(0);
                await assertErrorMessage(tx, 'InvalidPrice(0)');
            }
        });
        
        it('Properly handles buying', async() => {
            {
                const tx = await contract.connect(alice)
                    .buy(15, { value: ethers.utils.parseEther('0.15') });
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
        
                const boughtEvent = findEvent<CoinsBoughtEvent>(result, 'CoinsBought');
                expect(boughtEvent.args.by).to.be.equal(alice.address);
                expect(boughtEvent.args.amount).to.be.equal(15);
                expect(boughtEvent.args.price).to.be.equal(ethers.utils.parseEther('0.01'));
        
                const mintedEvent = findEvent<CoinsMintedEvent>(result, 'CoinsMinted');
                expect(mintedEvent.args.by).to.be.equal(contract.address);
                expect(mintedEvent.args.target).to.be.equal(alice.address);
                expect(mintedEvent.args.amount).to.be.equal(15);
        
                // check balance updated
                const balance = await contract.balanceOf(alice.address);
                expect(balance).to.be.equal(15);
            }
            
            // change price
            {
                const tx = await contract.connect(owner)
                    .changePrice(ethers.utils.parseEther('0.1'));
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // buy again
            {
                const tx = await contract.connect(alice)
                    .buy(5, { value: ethers.utils.parseEther('0.5') });
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
        
                const boughtEvent = findEvent<CoinsBoughtEvent>(result, 'CoinsBought');
                expect(boughtEvent.args.by).to.be.equal(alice.address);
                expect(boughtEvent.args.amount).to.be.equal(5);
                expect(boughtEvent.args.price).to.be.equal(ethers.utils.parseEther('0.1'));
        
                const mintedEvent = findEvent<CoinsMintedEvent>(result, 'CoinsMinted');
                expect(mintedEvent.args.by).to.be.equal(contract.address);
                expect(mintedEvent.args.target).to.be.equal(alice.address);
                expect(mintedEvent.args.amount).to.be.equal(5);
        
                // check balance updated
                const balance = await contract.balanceOf(alice.address);
                expect(balance).to.be.equal(20);
            }
        });
        
        it('Should not allow buying with wrong value sent', async() => {
            {
                const required = ethers.utils.parseEther('0.15');
                const send = ethers.utils.parseEther('0.16');
                const tx = contract.connect(alice)
                    .buy(15, { value: send });
                await assertErrorMessage(tx, `InvalidAmountSend(${send}, ${required})`);
            }
            
            {
                const required = ethers.utils.parseEther('0.15');
                const send = ethers.utils.parseEther('0.14');
                const tx = contract.connect(alice)
                    .buy(15, { value: send });
                await assertErrorMessage(tx, `InvalidAmountSend(${send}, ${required})`);
            }
        });
        
        it('Should not allow buying 0', async() => {
            const tx = contract.connect(alice)
                .buy(0, { value: 0 });
            await assertErrorMessage(tx, 'WrongAmount(0)');
        });
        
        it('Should properly transfer funds', async() => {
            const initalFunds = await owner.getBalance();
        
            {
                const tx = await contract.connect(alice)
                    .buy(15, { value: ethers.utils.parseEther('0.15') });
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            const funds = await owner.getBalance();
            const delta = funds.sub(initalFunds);
            expect(delta).to.be.equal(ethers.utils.parseEther('0.15'));
            
            const contractFunds = await ethers.provider.getBalance(contract.address);
            expect(contractFunds).to.be.equal(0);
        });
        
        it('Should not allow direct transfers', async() => {
            const tx = alice.sendTransaction({
                to: contract.address,
                value: ethers.utils.parseEther('1'),
            });
            await assertErrorMessage(tx, 'NotAllowed()');
        });
        
    });
    
});
