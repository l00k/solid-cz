import { CoinsMintedEvent, Mintable, TotalSupplyChangedEvent } from '@/Mintable';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Factory, initialSupply } from './fixtures/contracts';
import { assertErrorMessage, findEvent } from './helpers/utils';


const contractsToTest = [
    'SampleCoin'
];

contractsToTest.forEach(contractName => {
    
    describe(`${contractName} is Mintable`, () => {
        let owner : SignerWithAddress;
        let alice : SignerWithAddress;
        let bob : SignerWithAddress;
        let contract : Mintable;
        
        beforeEach(async() => {
            [ owner, alice, bob ] = await ethers.getSigners();
            contract = <any> await Factory[contractName]();
        });
        
        it('Allow minting only to owners', async() => {
            // try to mint by alice (without ownership)
            {
                const tx = contract.connect(alice)
                    .mint(bob.address, 1000);
                await assertErrorMessage(tx, 'OnlyOwnerAllowed()');
            }
            
            // add ownership to alice
            {
                const tx = await contract.connect(owner)
                    .addOwner(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // mint new coins by alice
            {
                const tx = await contract.connect(alice)
                    .mint(bob.address, 1000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Proper minting result', async() => {
            const tx = await contract.connect(owner)
                .mint(alice.address, 1000);
            const result = await tx.wait();
            
            expect(result.status).to.be.equal(1);
            
            {
                const event = findEvent<CoinsMintedEvent>(result, 'CoinsMinted');
                expect(event.args.by).to.be.equal(owner.address);
                expect(event.args.target).to.be.equal(alice.address);
                expect(event.args.amount).to.be.equal(1000);
            }
            
            {
                const event = findEvent<TotalSupplyChangedEvent>(result, 'TotalSupplyChanged');
                expect(event.args.from).to.be.equal(initialSupply);
                expect(event.args.to).to.be.equal(initialSupply + 1000);
            }
            
            const balance = await contract.balanceOf(alice.address);
            expect(balance).to.be.equal(1000);
            
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.be.equal(initialSupply + 1000);
        });
        
        it('Invalid minting args', async() => {
            const tx = contract.connect(owner)
                .mint(alice.address, 0);
            await assertErrorMessage(tx, 'WrongAmount(0)');
        });
        
        it('Allow burning only to owners', async() => {
            // send some funds to bob
            {
                const tx = await contract.connect(owner)
                    .transfer(bob.address, 5000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // try to mint by alice (without ownership)
            {
                const tx = contract.connect(alice)
                    .burn(bob.address, 1000);
                await assertErrorMessage(tx, 'OnlyOwnerAllowed()');
            }
            
            // add ownership to alice
            {
                const tx = await contract.connect(owner)
                    .addOwner(alice.address);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // burn coins of bob
            {
                const tx = await contract.connect(alice)
                    .burn(bob.address, 1000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // burn more coins of bob
            {
                const tx = await contract.connect(owner)
                    .burn(bob.address, 100000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
        });
        
        it('Proper burning result', async() => {
            // send some funds to alice
            {
                const tx = await contract.connect(owner)
                    .transfer(alice.address, 5000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
            }
            
            // burn part
            {
                const tx = await contract.connect(owner)
                    .burn(alice.address, 1000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event1 = findEvent<CoinsMintedEvent>(result, 'CoinsBurnt');
                expect(event1.args.by).to.be.equal(owner.address);
                expect(event1.args.target).to.be.equal(alice.address);
                expect(event1.args.amount).to.be.equal(1000);
                
                const event2 = findEvent<TotalSupplyChangedEvent>(result, 'TotalSupplyChanged');
                expect(event2.args.from).to.be.equal(initialSupply);
                expect(event2.args.to).to.be.equal(initialSupply - 1000);
            }
            
            const balance = await contract.balanceOf(alice.address);
            expect(balance).to.be.equal(4000);
            
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.be.equal(initialSupply - 1000);
            
            // burn lot
            {
                const tx = await contract.connect(owner)
                    .burn(alice.address, 100000);
                const result = await tx.wait();
                expect(result.status).to.be.equal(1);
                
                const event1 = findEvent<CoinsMintedEvent>(result, 'CoinsBurnt');
                expect(event1.args.by).to.be.equal(owner.address);
                expect(event1.args.target).to.be.equal(alice.address);
                expect(event1.args.amount).to.be.equal(4000);
                
                const event2 = findEvent<TotalSupplyChangedEvent>(result, 'TotalSupplyChanged');
                expect(event2.args.from).to.be.equal(initialSupply - 1000);
                expect(event2.args.to).to.be.equal(initialSupply - 5000);
                
                const balance = await contract.balanceOf(alice.address);
                expect(balance).to.be.equal(0);
            }
        });
        
        it('Invalid burning args', async() => {
            const tx = contract.connect(owner)
                .burn(alice.address, 0);
            await assertErrorMessage(tx, 'WrongAmount(0)');
        });
        
    });
    
});
